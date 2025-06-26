const axios = require("axios");

const DEFAULT_K = Number(process.env.DEFAULT_K_OPENSEARCH_HITS || 25);
const EMBED_DIM = Number(process.env.EMBED_DIM || 1536);
const envScoreThreshold = parseFloat(process.env.OPENSEARCH_SCORE_THRESHOLD);
const OPENSEARCH_SCORE_THRESHOLD = !isNaN(envScoreThreshold)
  ? envScoreThreshold
  : 0.7;

// --- CRITICAL FIX: Corrected service name from underscore to hyphen ---
const EMBEDDING_SERVICE_URL = "http://embedding-service:8001";

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

/**
 * Runs a single hybrid (keyword + vector) search.
 */
async function hybridSearch(os, index, body) {
  try {
    const response = await os.search({ index, body });
    const all = response.body.hits.hits;

    if (all.length > 0) {
      log(
        `[hybridSearch] Raw child chunk hits before filtering: ${all.length}`
      );
    } else {
      log(`[hybridSearch] No raw hits returned from OpenSearch for this term.`);
    }
    const filtered = all.filter(
      (hit) => !hit._score || hit._score >= OPENSEARCH_SCORE_THRESHOLD
    );
    log(
      `[hybridSearch] Child chunk hits after score filter (threshold >=${OPENSEARCH_SCORE_THRESHOLD}): ${filtered.length}`
    );
    return filtered;
  } catch (err) {
    warn(
      `[hybridSearch] Error executing hybrid search:`,
      err.meta ? JSON.stringify(err.meta.body, null, 2) : err.message
    );
    warn("[hybridSearch] Failing query body:", JSON.stringify(body, null, 2));
    return [];
  }
}

/**
 * Executes the ANN plan and then fetches parent documents.
 */
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

  // Step 1: Get the child document hits from OpenSearch
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

  // Interleave and dedupe the child hits
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
    log("[runSteps] No child documents found after search. Returning empty.");
    return [];
  }

  // Step 2: Extract unique parent IDs from the child chunk metadata
  const parentIds = [
    ...new Set(
      interleavedChildHits
        .map((hit) => hit._source?.metadata?.parentId)
        .filter(Boolean)
    ),
  ];

  if (parentIds.length === 0) {
    warn(
      "[runSteps] No parent IDs found in child document metadata. Cannot fetch parent documents."
    );
    return [];
  }

  log(
    `[runSteps] Found ${parentIds.length} unique parent document IDs to fetch.`
  );

  // Step 3: Fetch the full parent documents from the embedding-service's docstore
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
