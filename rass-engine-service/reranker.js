// rass-engine-service/reranker.js
const axios = require("axios");

async function rerank(query, documents) {
  // If there's nothing to rerank, return immediately.
  if (!documents || documents.length === 0) {
    return [];
  }

  // Prepare valid docs and texts
  const validDocs = documents.filter(
    (doc) => typeof doc.text === "string" && doc.text.trim().length > 0
  );
  if (validDocs.length === 0) {
    console.warn("[Reranker] No valid documents to rerank.");
    return [];
  }
  if (typeof query !== "string") {
    throw new Error("Query is not a string: " + JSON.stringify(query));
  }
  const docTexts = validDocs.map((doc) => doc.text);

  try {
    // Call the Python reranker microservice
    const response = await axios.post(
      "http://py_reranker:8008/rerank", // Use Docker Compose service name
      {
        query,
        documents: docTexts,
        top_k: docTexts.length,
      },
      { timeout: 60000 }
    );
    const { reranked, scores } = response.data;
    // Map reranked indices and scores back to docs
    const rerankedDocs = reranked.map((idx, i) => ({
      ...validDocs[idx],
      rerank_score: scores[i],
    }));
    return rerankedDocs;
  } catch (error) {
    console.error("[Reranker] Python microservice error:", error.message);
    return validDocs;
  }
}

module.exports = { rerank };
