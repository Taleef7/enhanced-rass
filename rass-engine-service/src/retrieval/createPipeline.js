// rass-engine-service/src/retrieval/createPipeline.js
// Factory function that assembles the ordered retrieval pipeline.
// Each stage can be individually disabled or replaced via config.

"use strict";

const { Pipeline } = require("./Pipeline");
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
 *   1. HydeQueryExpansionStage  — (optional) expand query with hypothetical document
 *   2. EmbedQueryStage          — embed the (possibly expanded) query
 *   3. HybridSearchStage        — KNN + BM25 search against OpenSearch
 *   4. ParentFetchStage         — fetch parent documents from embedding service
 *   5. DeduplicateStage         — remove duplicate parent documents
 *   6. RerankStage              — cross-encoder reranking (no-op if disabled)
 *   7. FeedbackBoostStage       — personalized score boost based on user feedback (Phase G)
 *   8. TopKSelectStage          — select top-K documents for generation
 *
 * @param {object} config - Service config object (from src/config.js).
 * @returns {Pipeline} The configured retrieval pipeline.
 */
function createPipeline(config) {
  return new Pipeline([
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
