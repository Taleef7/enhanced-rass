// rass-engine-service/src/retrieval/RerankStage.js
// Applies cross-encoder reranking to context.dedupedDocs.
// The reranking provider is selected based on config.RERANK_PROVIDER.
// When RERANK_PROVIDER is 'none' (default), NoopRerankProvider is used.
// Rerank scores are logged at DEBUG level.

"use strict";

const { Stage } = require("./Stage");
const { NoopRerankProvider } = require("./reranking/NoopRerankProvider");
const logger = require("../logger");
const { withSpan } = require("../tracing");

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
      logger.info("[RerankStage] Using CohereRerankProvider.");
      return new CohereRerankProvider(this.config);
    }

    if (providerName === "local") {
      const { LocalCrossEncoderProvider } = require("./reranking/LocalCrossEncoderProvider");
      logger.info("[RerankStage] Using LocalCrossEncoderProvider.");
      return new LocalCrossEncoderProvider(this.config);
    }

    logger.info("[RerankStage] RERANK_PROVIDER=none — using NoopRerankProvider.");
    return new NoopRerankProvider();
  }

  async run(context) {
    const { dedupedDocs, originalQuery } = context;

    if (!dedupedDocs || dedupedDocs.length === 0) {
      logger.warn("[RerankStage] No deduplicated docs to rerank; skipping.");
      context.rankedChunks = [];
      return context;
    }

    const rerankTopN =
      this.config.RERANK_TOP_N != null ? this.config.RERANK_TOP_N : context.topK;

    return withSpan("retrieval.rerank", { "rerank.provider": this.config.RERANK_PROVIDER || "none", "rerank.inputDocs": dedupedDocs.length }, async () => {
      context.rankedChunks = await this.provider.rerank(originalQuery, dedupedDocs, rerankTopN);
      logger.info(
        `[RerankStage] Reranking complete: ${dedupedDocs.length} → ${context.rankedChunks.length} docs.`
      );
      return context;
    });
  }
}

module.exports = { RerankStage };
