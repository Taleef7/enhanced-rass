// rass-engine-service/src/retrieval/RerankStage.js
// Applies cross-encoder reranking to context.dedupedDocs.
// The reranking provider is selected based on config.RERANK_PROVIDER.
// When RERANK_PROVIDER is 'none' (default), NoopRerankProvider is used.
// Rerank scores are logged at DEBUG level.

"use strict";

const { Stage } = require("./Stage");
const { NoopRerankProvider } = require("./reranking/NoopRerankProvider");

class RerankStage extends Stage {
  /**
   * @param {object} config - Service config object with RERANK_PROVIDER, RERANK_TOP_N, etc.
   */
  constructor(config) {
    super("RerankStage");
    this.config = config || {};
    this.provider = this._buildProvider();
  }

  _buildProvider() {
    const providerName = (this.config.RERANK_PROVIDER || "none").toLowerCase();

    if (providerName === "cohere") {
      const { CohereRerankProvider } = require("./reranking/CohereRerankProvider");
      console.log("[RerankStage] Using CohereRerankProvider.");
      return new CohereRerankProvider(this.config);
    }

    if (providerName === "local") {
      const { LocalCrossEncoderProvider } = require("./reranking/LocalCrossEncoderProvider");
      console.log("[RerankStage] Using LocalCrossEncoderProvider.");
      return new LocalCrossEncoderProvider(this.config);
    }

    console.log("[RerankStage] RERANK_PROVIDER=none — using NoopRerankProvider.");
    return new NoopRerankProvider();
  }

  async run(context) {
    const { dedupedDocs, originalQuery, topK } = context;

    if (!dedupedDocs || dedupedDocs.length === 0) {
      console.warn("[RerankStage] No deduplicated docs to rerank; skipping.");
      context.rankedChunks = [];
      return context;
    }

    context.rankedChunks = await this.provider.rerank(originalQuery, dedupedDocs, topK);

    console.log(
      `[RerankStage] Reranking complete: ${dedupedDocs.length} → ${context.rankedChunks.length} docs.`
    );
    return context;
  }
}

module.exports = { RerankStage };
