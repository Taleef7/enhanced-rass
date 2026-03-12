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
      logger.info(`[EmbedQueryStage] Embedding query: "${context.query.substring(0, 80)}..."`);
      context.queryEmbedding = await embedText(context.query);
      logger.info(`[EmbedQueryStage] Embedding vector length: ${context.queryEmbedding?.length}`);
      return context;
    });
  }
}

module.exports = { EmbedQueryStage };
