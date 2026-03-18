// rass-engine-service/src/retrieval/createPipeline.js
// Factory function that assembles the ordered retrieval pipeline.
// Each stage can be individually disabled or replaced via config.

"use strict";

const { Pipeline } = require("./Pipeline");
const { QueryReformulationStage } = require("./QueryReformulationStage");
const { HydeQueryExpansionStage } = require("./HydeQueryExpansionStage");
const { EmbedQueryStage } = require("./EmbedQueryStage");
const { HybridSearchStage } = require("./HybridSearchStage");
const { GraphExpansionStage } = require("./GraphExpansionStage");
const { ParentFetchStage } = require("./ParentFetchStage");
const { DeduplicateStage } = require("./DeduplicateStage");
const { RerankStage } = require("./RerankStage");
const { FeedbackBoostStage } = require("./FeedbackBoostStage");
const { TopKSelectStage } = require("./TopKSelectStage");
const { WebSearchFallbackStage } = require("./WebSearchFallbackStage");

/**
 * Creates and returns the configured retrieval pipeline.
 *
 * Stage order:
 *   1.  QueryReformulationStage  — (Phase 2.1) rewrite follow-up questions using conversation history
 *   2.  HydeQueryExpansionStage  — (Phase 1.3 fixed) embed hypothetical document separately for KNN
 *   3.  EmbedQueryStage          — use HyDE embedding if available, else embed query
 *   4.  HybridSearchStage        — KNN + BM25 search against per-KB OpenSearch index (Phase 1.2)
 *   5.  GraphExpansionStage      — (Phase 6.3) inject entity-related docs from knowledge graph
 *   6.  ParentFetchStage         — fetch parent documents from Redis
 *   7.  DeduplicateStage         — remove duplicate parent documents
 *   8.  RerankStage              — cross-encoder reranking (Phase 1.1: enabled via config)
 *   9.  FeedbackBoostStage       — personalized score boost with caching (Phase 1.6)
 *   10. TopKSelectStage          — select top-K with lost-in-middle reordering (Phase 1.4)
 *   11. WebSearchFallbackStage   — (Phase 7.2) fallback web search if top chunk score < threshold
 *
 * @param {object} config - Service config object (from src/config.js).
 * @returns {Pipeline} The configured retrieval pipeline.
 */
function createPipeline(config) {
  return new Pipeline([
    new QueryReformulationStage(config),
    new HydeQueryExpansionStage(config),
    new EmbedQueryStage(),
    new HybridSearchStage(),
    new GraphExpansionStage(config),
    new ParentFetchStage(),
    new DeduplicateStage(),
    new RerankStage(config),
    new FeedbackBoostStage(config),
    new TopKSelectStage(),
    new WebSearchFallbackStage(config),
  ]);
}

module.exports = { createPipeline };
