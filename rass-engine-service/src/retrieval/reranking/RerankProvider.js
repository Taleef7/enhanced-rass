// rass-engine-service/src/retrieval/reranking/RerankProvider.js
// Abstract interface for reranking providers.
// All providers must implement the rerank() method.

"use strict";

class RerankProvider {
  /**
   * Rerank a list of documents given a query.
   *
   * @param {string} query - The user's query string.
   * @param {object[]} documents - Array of pipeline doc objects ({ _source, _score }).
   * @param {number} [topN] - Maximum number of documents to return.
   * @returns {Promise<object[]>} Documents sorted by relevance (best first), with rerankScore attached.
   */
  async rerank(query, documents, topN) {
    throw new Error(`${this.constructor.name} must implement rerank(query, documents, topN).`);
  }
}

module.exports = { RerankProvider };
