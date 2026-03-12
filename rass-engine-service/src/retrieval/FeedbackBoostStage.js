// rass-engine-service/src/retrieval/FeedbackBoostStage.js
// Phase G #134: Applies personalized feedback boosts to retrieved documents.
//
// For users in A/B group B, chunks and documents that received prior positive
// feedback from the same user are boosted; those with prior negative feedback
// are penalised. Users in group A receive no modification (control group).
//
// The stage operates on context.rankedChunks (post-rerank) or context.dedupedDocs
// as a fallback — whichever TopKSelectStage will consume first.
// It queries the mcp-server's internal /internal/feedback/boosts endpoint to
// retrieve per-document boost multipliers for the current user.
// Multiplier values are tunable via POSITIVE_FEEDBACK_BOOST / NEGATIVE_FEEDBACK_PENALTY
// env vars on the mcp-server.

"use strict";

const axios = require("axios");
const { Stage } = require("./Stage");
const logger = require("../logger");

// Internal mcp-server base URL
const MCP_SERVER_INTERNAL_URL =
  process.env.MCP_SERVER_URL || "http://mcp-server:8080";

const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const internalHeaders = INTERNAL_SERVICE_TOKEN
  ? { "x-internal-token": INTERNAL_SERVICE_TOKEN }
  : {};

// Multipliers applied to relevance scores — the mcp-server /internal/feedback/boosts endpoint
// returns the final multiplier value (tunable via POSITIVE_FEEDBACK_BOOST /
// NEGATIVE_FEEDBACK_PENALTY env vars there).

class FeedbackBoostStage extends Stage {
  constructor(config) {
    super("FeedbackBoostStage");
    this.config = config || {};
    // Allow disabling via config
    this.enabled = config.FEEDBACK_BOOST_ENABLED !== false;
  }

  async run(context) {
    if (!this.enabled) {
      logger.info("[FeedbackBoostStage] Disabled — skipping.");
      return context;
    }

    const { userId } = context;

    // Prefer rankedChunks (post-rerank) over dedupedDocs; TopKSelectStage reads rankedChunks first.
    const docsKey = context.rankedChunks?.length > 0 ? "rankedChunks" : "dedupedDocs";
    const docs = context[docsKey];

    // No user context or no documents — nothing to boost
    if (!userId || !docs || docs.length === 0) {
      return context;
    }

    // Fetch user's A/B group from the mcp-server
    let abGroup = "a";
    try {
      const groupRes = await axios.get(
        `${MCP_SERVER_INTERNAL_URL}/internal/feedback/ab-group/${userId}`,
        { timeout: 3000, headers: internalHeaders }
      );
      abGroup = groupRes.data?.abGroup || "a";
    } catch (err) {
      // Non-fatal: fall back to control group
      logger.warn(`[FeedbackBoostStage] Could not fetch A/B group for ${userId}: ${err.message}`);
    }

    // Log group membership alongside the query
    context.abGroup = abGroup;
    logger.info(`[FeedbackBoostStage] User ${userId} is in A/B group "${abGroup}".`);

    // Control group — no modification
    if (abGroup === "a") {
      return context;
    }

    // Treatment group B — apply feedback boosts
    let boostMap = {};
    try {
      const boostRes = await axios.get(
        `${MCP_SERVER_INTERNAL_URL}/internal/feedback/boosts/${userId}`,
        { timeout: 3000, headers: internalHeaders }
      );
      boostMap = boostRes.data?.boosts || {};
    } catch (err) {
      logger.warn(`[FeedbackBoostStage] Could not fetch feedback boosts for ${userId}: ${err.message}`);
      // Gracefully degrade — proceed without boosts
      return context;
    }

    if (Object.keys(boostMap).length === 0) {
      logger.info("[FeedbackBoostStage] No feedback boosts found for user — returning original ranking.");
      return context;
    }

    // Apply multipliers to the active doc list.
    // Docs in the pipeline are OpenSearch hits: { _id, _score, _source: { metadata, text, ... } }
    const boosted = docs.map((doc) => {
      const meta = doc._source?.metadata || {};
      const docId =
        meta.documentId ||
        meta.source ||
        meta.originalFilename;

      const chunkId = doc._id;

      // Check document-level boost first, then chunk-level
      const multiplier = boostMap[docId] || boostMap[chunkId] || 1.0;

      if (multiplier !== 1.0) {
        logger.info(
          `[FeedbackBoostStage] Applying multiplier ${multiplier} to doc "${docId}"`
        );
      }

      return {
        ...doc,
        _score: (doc._score || 0) * multiplier,
        _feedbackBoosted: multiplier !== 1.0,
      };
    });

    // Re-sort by adjusted score descending
    boosted.sort((a, b) => (b._score || 0) - (a._score || 0));

    context[docsKey] = boosted;
    logger.info(
      `[FeedbackBoostStage] Applied feedback boosts to ${boosted.filter((d) => d._feedbackBoosted).length} of ${boosted.length} documents (${docsKey}).`
    );

    return context;
  }
}

module.exports = { FeedbackBoostStage };
