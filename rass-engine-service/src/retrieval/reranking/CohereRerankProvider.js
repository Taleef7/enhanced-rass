// rass-engine-service/src/retrieval/reranking/CohereRerankProvider.js
// Reranking provider backed by the Cohere Rerank API.
// Requires COHERE_API_KEY environment variable and RERANK_PROVIDER=cohere in config.

"use strict";

const { RerankProvider } = require("./RerankProvider");

class CohereRerankProvider extends RerankProvider {
  /**
   * @param {object} config - Service config object.
   * @param {number} [config.RERANK_TOP_N] - Max documents to return.
   */
  constructor(config) {
    super();
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[CohereRerankProvider] COHERE_API_KEY environment variable is required."
      );
    }
    this.apiKey = apiKey;
    this.topN = config?.RERANK_TOP_N || 5;
    this.model = config?.COHERE_RERANK_MODEL || "rerank-english-v3.0";
  }

  /**
   * @param {string} query
   * @param {object[]} documents - Pipeline doc objects.
   * @param {number} [topN]
   * @returns {Promise<object[]>}
   */
  async rerank(query, documents, topN) {
    const n = topN || this.topN;
    const docTexts = documents.map((d) => d._source?.text || "");

    console.log(
      `[CohereRerankProvider] Reranking ${documents.length} documents (topN=${n}).`
    );

    const { default: axios } = await import("axios").catch(() => {
      // CommonJS fallback
      return { default: require("axios") };
    });

    let ranked;
    try {
      const response = await axios.post(
        "https://api.cohere.ai/v1/rerank",
        {
          model: this.model,
          query,
          documents: docTexts,
          top_n: n,
          return_documents: false,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
      ranked = response.data.results;
    } catch (err) {
      console.error(`[CohereRerankProvider] API error: ${err.message}. Returning original order.`);
      return documents.slice(0, n);
    }

    // Re-sort original docs by the rerank relevance_score
    const reranked = ranked.map((r) => {
      const doc = documents[r.index];
      const augmented = { ...doc, rerankScore: r.relevance_score };
      console.debug(
        `[CohereRerankProvider] doc[${r.index}] rerankScore=${r.relevance_score.toFixed(4)}`
      );
      return augmented;
    });

    return reranked;
  }
}

module.exports = { CohereRerankProvider };
