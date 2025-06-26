const axios = require("axios");

const DEFAULT_K = Number(process.env.DEFAULT_K_OPENSEARCH_HITS || 25);
const EMBED_DIM = Number(process.env.EMBED_DIM || 1536);
const envScoreThreshold = parseFloat(process.env.OPENSEARCH_SCORE_THRESHOLD);
const OPENSEARCH_SCORE_THRESHOLD = !isNaN(envScoreThreshold)
  ? envScoreThreshold
  : 0.7;

const EMBEDDING_SERVICE_URL = "http://embedding-service:8001";

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

async function hybridSearch(os, index, body) {
  try {
    const response = await os.search({ index, body });
    const all = response.body.hits.hits;
    const filtered = all.filter(
      (hit) => !hit._score || hit._score >= OPENSEARCH_SCORE_THRESHOLD
    );
    return filtered;
  } catch (err) {
    warn(`[hybridSearch] Error executing hybrid search:`, err.message);
    return [];
  }
}

async function runSteps({ plan, embed, os, index }) {
  const VEC_CACHE = new Map();

  async function embedOnce(text) {
    if (!VEC_CACHE.has(text)) {
      const vec = await embed(text);
      if (!Array.isArray(vec) || vec.length !== EMBED_DIM)
        throw new Error(`Bad embedding length for "${text}"`);
      VEC_CACHE.set(text, vec);
    }
    return VEC_CACHE.get(text);
  }

  const perStepHits = [];
  for (const step of plan) {
    const term = step.search_term?.trim();
    if (!term) continue;

    const vector = await embedOnce(term);
    const k = step.knn_k || DEFAULT_K;

    const body = {
      size: k,
      query: {
        hybrid: {
          queries: [
            { match: { text: { query: term } } },
            { knn: { embedding: { vector, k } } },
          ],
        },
      },
    };

    const hits = await hybridSearch(os, index, body);
    perStepHits.push(hits);
  }

  const interleavedChildHits = [];
  const seenChildIds = new Set();
  const maxLen = Math.max(...perStepHits.map((h) => h.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const hits of perStepHits) {
      const hit = hits[i];
      if (hit && !seenChildIds.has(hit._id)) {
        seenChildIds.add(hit._id);
        interleavedChildHits.push(hit);
      }
    }
  }

  if (interleavedChildHits.length === 0) {
    return [];
  }

  const parentIds = [
    ...new Set(
      interleavedChildHits
        .map((hit) => hit._source?.metadata?.parentId)
        .filter(Boolean)
    ),
  ];

  if (parentIds.length === 0) {
    warn("[runSteps] No parent IDs found in child document metadata.");
    return [];
  }

  // --- NEW DEBUGGING LOG ---
  console.log(
    `[DEBUG] Attempting to fetch parent IDs from embedding-service:`,
    parentIds
  );

  try {
    const response = await axios.post(
      `${EMBEDDING_SERVICE_URL}/get-documents`,
      {
        ids: parentIds,
      }
    );
    const parentDocuments = response.data.documents;
    log(
      `[runSteps] Successfully fetched ${parentDocuments.length} parent documents from docstore.`
    );

    return parentDocuments.map((doc) => ({
      _source: {
        text: doc.pageContent,
        metadata: doc.metadata,
      },
      _score: 1.0,
    }));
  } catch (error) {
    warn(
      `[runSteps] Failed to fetch parent documents from embedding-service: ${error.message}`
    );
    return [];
  }
}

module.exports = { runSteps };
