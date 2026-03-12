// rass-engine-service/src/retrieval/context.js
// Factory for creating the shared pipeline context object.
// The context is threaded through every stage of the retrieval pipeline.

"use strict";

/**
 * Creates a fresh pipeline context with sensible defaults.
 *
 * @param {object} params
 * @param {string} params.query          - The user's original query string.
 * @param {string} [params.userId]       - Optional user ID for scoping results.
 * @param {string[]} [params.documents]  - Optional list of document sources to filter by.
 * @param {number} [params.topK]         - Maximum number of source documents for generation.
 * @param {object} [params.config]       - Service config object.
 * @returns {object} The initial pipeline context.
 */
function createContext({ query, userId, documents, topK, config }) {
  return {
    query,                  // raw query string (may be replaced by HyDE stage)
    originalQuery: query,   // always the original user query, never replaced
    userId: userId || null,
    documents: documents || [],
    topK: topK || 5,
    config: config || {},

    // Stage outputs — populated as the pipeline progresses
    queryEmbedding: null,    // number[] — set by EmbedQueryStage
    candidateChunks: [],     // raw OpenSearch hits — set by HybridSearchStage
    rankedChunks: [],        // reranked/sorted hits — set by RerankStage
    parentDocs: [],          // parent documents from Redis — set by ParentFetchStage
    dedupedDocs: [],         // deduplicated parent documents — set by DeduplicateStage
    selectedDocs: [],        // final top-K documents for generation — set by TopKSelectStage

    // Per-stage wall-clock timings (milliseconds)
    stageTimes: {},
  };
}

module.exports = { createContext };
