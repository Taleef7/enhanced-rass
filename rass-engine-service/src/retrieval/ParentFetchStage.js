// rass-engine-service/src/retrieval/ParentFetchStage.js
// Fetches full parent documents from the embedding service for each candidate chunk's parentId.
// Stores the fetched parent documents in context.parentDocs.

"use strict";

const axios = require("axios");
const { Stage } = require("./Stage");
const { EMBEDDING_SERVICE_BASE_URL } = require("../config");

class ParentFetchStage extends Stage {
  constructor() {
    super("ParentFetchStage");
  }

  async run(context) {
    const { candidateChunks } = context;

    if (!candidateChunks || candidateChunks.length === 0) {
      console.warn("[ParentFetchStage] No candidate chunks; skipping parent fetch.");
      context.parentDocs = [];
      return context;
    }

    // Build a map from parentId -> best-scoring child hit
    const parentIdMap = new Map();
    for (const hit of candidateChunks) {
      const parentId = hit._source?.metadata?.parentId;
      if (
        parentId &&
        (!parentIdMap.has(parentId) || hit._score > parentIdMap.get(parentId)._score)
      ) {
        parentIdMap.set(parentId, hit);
      }
    }

    const uniqueParentIds = Array.from(parentIdMap.keys());

    if (uniqueParentIds.length === 0) {
      console.warn("[ParentFetchStage] No parentId found in chunk metadata; falling back to raw chunks.");
      // Fall back to using the candidate chunks directly (no parent/child splitting used)
      context.parentDocs = candidateChunks.map((hit) => ({
        _source: { text: hit._source?.text, metadata: hit._source?.metadata },
        _score: hit._score,
      }));
      return context;
    }

    console.log(`[ParentFetchStage] Fetching ${uniqueParentIds.length} unique parent documents.`);

    try {
      const response = await axios.post(`${EMBEDDING_SERVICE_BASE_URL}/get-documents`, {
        ids: uniqueParentIds,
      });
      const rawDocs = response.data.documents.filter((doc) => doc !== null);
      console.log(`[ParentFetchStage] Successfully fetched ${rawDocs.length} parent documents.`);
      context.parentDocs = rawDocs.map((doc) => ({
        _source: { text: doc.pageContent, metadata: doc.metadata },
        _score: parentIdMap.get(doc.metadata?.docId)?._score || 0,
      }));
    } catch (error) {
      console.warn(`[ParentFetchStage] Failed to fetch parent documents: ${error.message}. Falling back to raw chunks.`);
      context.parentDocs = candidateChunks.map((hit) => ({
        _source: { text: hit._source?.text, metadata: hit._source?.metadata },
        _score: hit._score,
      }));
    }

    return context;
  }
}

module.exports = { ParentFetchStage };
