// rass-engine-service/src/retrieval/HydeQueryExpansionStage.js
// HyDE (Hypothetical Document Embeddings) query expansion stage.
// When HYDE_ENABLED=true, generates a hypothetical document for the user's query,
// embeds it SEPARATELY, and stores the HyDE embedding in context.hydeEmbedding.
// EmbedQueryStage then uses this embedding for KNN, while context.query (the
// actual text) is still used for BM25 — this is the correct HyDE implementation.
// Falls back gracefully on LLM or embedding failure (no crash).

"use strict";

const { Stage } = require("./Stage");
const { generateHypotheticalDocument } = require("../planner/hydeGenerator");
const { embedText } = require("../clients/embedder");
const logger = require("../logger");

class HydeQueryExpansionStage extends Stage {
  /**
   * @param {object} config - Service config. Must include HYDE_ENABLED (boolean).
   */
  constructor(config) {
    super("HydeQueryExpansionStage");
    this.config = config || {};
  }

  async run(context) {
    const hydeEnabled = this.config.HYDE_ENABLED === true || this.config.HYDE_ENABLED === "true";

    if (!hydeEnabled) {
      logger.info("[HydeQueryExpansionStage] HYDE_ENABLED=false — skipping.");
      return context;
    }

    // Resolve max tokens from config, defaulting to 200 if not set or invalid
    const rawMaxTokens = this.config.HYDE_MAX_TOKENS;
    const hydeMaxTokens =
      Number.isFinite(Number(rawMaxTokens)) && Number(rawMaxTokens) > 0
        ? Number(rawMaxTokens)
        : 200;

    // Use the current query (possibly reformulated) for HyDE generation
    const queryForHyde = context.query || context.originalQuery;

    logger.info(
      `[HydeQueryExpansionStage] Generating hypothetical document for: "${queryForHyde.substring(0, 80)}..." (maxTokens=${hydeMaxTokens})`
    );

    let hypotheticalDoc = null;
    try {
      hypotheticalDoc = await generateHypotheticalDocument(queryForHyde, hydeMaxTokens);
    } catch (err) {
      logger.warn(
        `[HydeQueryExpansionStage] HyDE generation failed: ${err.message}. Falling back to standard embedding.`
      );
      return context;
    }

    if (!hypotheticalDoc || hypotheticalDoc === queryForHyde) {
      logger.info("[HydeQueryExpansionStage] No useful hypothetical document generated; skipping HyDE embedding.");
      return context;
    }

    // 1.3 Fix: Embed the hypothetical document SEPARATELY — do NOT concatenate with query.
    // The HyDE embedding is used for KNN (dense retrieval) in EmbedQueryStage.
    // The original query text stays in context.query for BM25 (sparse retrieval).
    // This preserves the distinct signal from each retrieval modality.
    try {
      context.hydeEmbedding = await embedText(hypotheticalDoc);
      logger.info(
        `[HydeQueryExpansionStage] HyDE embedding computed (${context.hydeEmbedding?.length} dims) from ${hypotheticalDoc.length}-char hypothetical document.`
      );
    } catch (embedErr) {
      logger.warn(`[HydeQueryExpansionStage] HyDE embedding failed: ${embedErr.message}. EmbedQueryStage will embed the query directly.`);
    }

    return context;
  }
}

module.exports = { HydeQueryExpansionStage };
