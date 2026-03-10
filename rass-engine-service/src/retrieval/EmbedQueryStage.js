// rass-engine-service/src/retrieval/EmbedQueryStage.js
// Embeds the query string (context.query) using the configured embedding provider.
// The resulting vector is stored in context.queryEmbedding.

"use strict";

const { Stage } = require("./Stage");
const { embedText } = require("../clients/embedder");

class EmbedQueryStage extends Stage {
  constructor() {
    super("EmbedQueryStage");
  }

  async run(context) {
    console.log(`[EmbedQueryStage] Embedding query: "${context.query.substring(0, 80)}..."`);
    context.queryEmbedding = await embedText(context.query);
    console.log(`[EmbedQueryStage] Embedding vector length: ${context.queryEmbedding?.length}`);
    return context;
  }
}

module.exports = { EmbedQueryStage };
