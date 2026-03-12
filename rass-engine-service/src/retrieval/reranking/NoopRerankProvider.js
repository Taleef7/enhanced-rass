// rass-engine-service/src/retrieval/reranking/NoopRerankProvider.js
// Default no-op reranking provider — returns documents unchanged.
// Used when RERANK_PROVIDER is 'none' or not configured.

"use strict";

const { RerankProvider } = require("./RerankProvider");
const logger = require("../../logger");

class NoopRerankProvider extends RerankProvider {
  async rerank(query, documents, topN) {
    const result = topN ? documents.slice(0, topN) : documents;
    logger.debug(
      `[NoopRerankProvider] Passing through ${result.length} documents unchanged.`
    );
    return result;
  }
}

module.exports = { NoopRerankProvider };
