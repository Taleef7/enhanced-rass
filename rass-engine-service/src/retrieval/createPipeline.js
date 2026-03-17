// rass-engine-service/src/retrieval/createPipeline.js
// Factory function that assembles the ordered retrieval pipeline.
// Each stage can be individually disabled or replaced via config.

"use strict";

const { Pipeline } = require("./Pipeline");
const { QueryReformulationStage } = require("./QueryReformulationStage");
const { HydeQueryExpansionStage } = require("./HydeQueryExpansionStage");
const { EmbedQueryStage } = require("./EmbedQueryStage");
const { HybridSearchStage } = require("./HybridSearchStage");
const { ParentFetchStage } = require("./ParentFetchStage");
const { DeduplicateStage } = require("./DeduplicateStage");
const { RerankStage } = require("./RerankStage");
const { FeedbackBoostStage } = require("./FeedbackBoostStage");
const { TopKSelectStage } = require("./TopKSelectStage");

/**
 * Creates and returns the configured retrieval pipeline.
 *
 * Stage order:
 *   1. QueryReformulationStage  — (Phase 2.1) rewrite follow-up questions using conversation history
 *   2. HydeQueryExpansionStage  — (Phase 1.3 fixed) embed hypothetical document separately for KNN
 *   3. EmbedQueryStage          — use HyDE embedding if available, else embed query
 *   4. HybridSearchStage        — KNN + BM25 search against per-KB OpenSearch index (Phase 1.2)
 *   5. ParentFetchStage         — fetch parent documents from Redis
 *   6. DeduplicateStage         — remove duplicate parent documents
 *   7. RerankStage              — cross-encoder reranking (Phase 1.1: enabled via config)
 *   8. FeedbackBoostStage       — personalized score boost with caching (Phase 1.6)
 *   9. TopKSelectStage          — select top-K with lost-in-middle reordering (Phase 1.4)
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
    new ParentFetchStage(),
    new DeduplicateStage(),
    new RerankStage(config),
    new FeedbackBoostStage(config),
    new TopKSelectStage(),
  ]);
}

module.exports = { createPipeline };
