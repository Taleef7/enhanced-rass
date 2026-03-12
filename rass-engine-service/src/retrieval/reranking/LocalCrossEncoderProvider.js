// rass-engine-service/src/retrieval/reranking/LocalCrossEncoderProvider.js
// Reranking provider backed by a local Python microservice running a cross-encoder model
// (e.g. cross-encoder/ms-marco-MiniLM-L-6-v2 via ONNX).
// The local service must expose POST /rerank with body: { query, documents: string[] }
// and return: { results: [{ index, score }] }

"use strict";

const axios = require("axios");
const { RerankProvider } = require("./RerankProvider");
const logger = require("../../logger");

class LocalCrossEncoderProvider extends RerankProvider {
  /**
   * @param {object} config - Service config object.
   * @param {number} [config.RERANKER_PORT] - Port of the local reranker service.
   * @param {number} [config.RERANK_TOP_N]  - Max docs to return.
   */
  constructor(config) {
    super();
    const port = config?.RERANKER_PORT || 8008;
    this.rerankUrl = process.env.RERANKER_URL || `http://localhost:${port}/rerank`;
    this.topN = config?.RERANK_TOP_N || 5;
  }

  async rerank(query, documents, topN) {
    const n = topN || this.topN;
    const docTexts = documents.map((d) => d._source?.text || "");

    logger.info(
      `[LocalCrossEncoderProvider] Reranking ${documents.length} docs via ${this.rerankUrl} (topN=${n}).`
    );

    let ranked;
    try {
      const response = await axios.post(
        this.rerankUrl,
        { query, documents: docTexts, top_n: n },
        { timeout: 20000 }
      );
      ranked = response.data.results;
    } catch (err) {
      logger.error(
        `[LocalCrossEncoderProvider] Request failed: ${err.message}. Returning original order.`
      );
      return documents.slice(0, n);
    }

    const reranked = ranked.map((r) => {
      const doc = documents[r.index];
      const augmented = { ...doc, rerankScore: r.score };
      logger.debug(
        `[LocalCrossEncoderProvider] doc[${r.index}] rerankScore=${r.score.toFixed(4)}`
      );
      return augmented;
    });

    return reranked;
  }
}

module.exports = { LocalCrossEncoderProvider };
