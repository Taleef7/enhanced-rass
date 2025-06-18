// rass-engine-service/reranker.js
const { pipeline } = require("@huggingface/transformers");

// This is a singleton class to ensure we only load the model once.
class RerankerPipeline {
  static instance = null;
  static task = "text-classification";
  // --- THIS IS THE FIX: Using the correct, verified model name ---
  static model = "mixedbread-ai/mxbai-rerank-xsmall-v1";

  static async getInstance() {
    if (this.instance === null) {
      console.log(
        `[Reranker] Initializing reranker model ('${this.model}') for the first time...`
      );
      // The pipeline function will download and cache the model on its first run.
      this.instance = await pipeline(this.task, this.model);
      console.log("[Reranker] Model initialized successfully.");
    }
    return this.instance;
  }
}

/**
 * Reranks a list of documents based on their relevance to a query using a cross-encoder model.
 * @param {string} query The user's query.
 * @param {Array<object>} documents The list of documents retrieved from the initial search. Each object must have a 'text' property.
 * @returns {Promise<Array<object>>} A new list of documents, sorted by relevance score.
 */
async function rerank(query, documents) {
  if (!documents || documents.length === 0) {
    return [];
  }

  try {
    console.log(
      `[Reranker] Starting reranking for ${documents.length} documents...`
    );
    const reranker = await RerankerPipeline.getInstance();

    const sentencePairs = documents.map((doc) => [query, doc.text]);
    const results = await reranker(sentencePairs, { top_k: null });

    const documentsWithScores = documents.map((doc, i) => ({
      ...doc,
      // This specific model returns a single score, not a label.
      // We check if the result is an array (multi-class) or single object (binary-class).
      rerank_score: Array.isArray(results[i])
        ? (results[i].find((res) => res.label === "positive") || {}).score || 0
        : results[i].score,
    }));

    const sortedDocuments = documentsWithScores.sort(
      (a, b) => b.rerank_score - a.rerank_score
    );

    console.log(`[Reranker] Reranking complete.`);
    return sortedDocuments;
  } catch (error) {
    console.error(
      "[Reranker] An error occurred during the reranking process:",
      error
    );
    return documents;
  }
}

module.exports = { rerank };
