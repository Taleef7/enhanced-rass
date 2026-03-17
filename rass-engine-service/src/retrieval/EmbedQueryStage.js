// rass-engine-service/src/retrieval/EmbedQueryStage.js
// Embeds the query string (context.query) using the configured embedding provider.
// The resulting vector is stored in context.queryEmbedding.

"use strict";

const { Stage } = require("./Stage");
const { embedText } = require("../clients/embedder");
const logger = require("../logger");
const { withSpan } = require("../tracing");

class EmbedQueryStage extends Stage {
  constructor() {
    super("EmbedQueryStage");
  }

  async run(context) {
    return withSpan("retrieval.embedQuery", { "query.length": context.query.length }, async () => {
      // 1.3 Fix: If HydeQueryExpansionStage computed a HyDE embedding, use it for KNN.
      // The HyDE embedding is derived from a hypothetical answer document, which is semantically
      // closer to actual document chunks than the raw query, improving KNN recall.
      // BM25 in HybridSearchStage still uses context.query (the real query text).
      if (context.hydeEmbedding && context.hydeEmbedding.length > 0) {
        context.queryEmbedding = context.hydeEmbedding;
        logger.info(`[EmbedQueryStage] Using HyDE embedding for KNN (${context.queryEmbedding.length} dims). BM25 will use original query text.`);
        return context;
      }

      logger.info(`[EmbedQueryStage] Embedding query: "${context.query.substring(0, 80)}..."`);
      context.queryEmbedding = await embedText(context.query);
      logger.info(`[EmbedQueryStage] Embedding vector length: ${context.queryEmbedding?.length}`);
      return context;
    });
  }
}

module.exports = { EmbedQueryStage };
