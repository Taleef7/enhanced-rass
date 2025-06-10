const DEFAULT_K = Number(process.env.DEFAULT_K_OPENSEARCH_HITS || 25);
const EMBED_DIM = Number(process.env.EMBED_DIM || 1536);
const envScoreThreshold = parseFloat(process.env.OPENSEARCH_SCORE_THRESHOLD);
const OPENSEARCH_SCORE_THRESHOLD = !isNaN(envScoreThreshold)
  ? envScoreThreshold
  : 0.78; // More robust check
const SCROLL_TTL = "60s";

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

/**
 * Runs a single hybrid (keyword + vector) search.
 */
async function hybridSearch(os, index, body) {
  try {
    // Note: Hybrid query doesn't use scrolling the same way.
    // It combines results from sub-queries at the shard level first.
    // We will handle pagination logic later if needed. For now, we get one page of results.
    const response = await os.search({ index, body });
    const all = response.body.hits.hits;

    if (all.length > 0) {
      log(`[hybridSearch] Top raw hits before filtering (up to 5):`);
      all
        .slice(0, 5)
        .forEach((hit) =>
          log(
            `  Raw Hit: id=${hit._id}, score=${
              hit._score
            }, text_chunk (first 50 chars): ${hit._source?.text_chunk?.substring(
              0,
              50
            )}`
          )
        );
    } else {
      log(`[hybridSearch] No raw hits returned from OpenSearch for this term.`);
    }
    const filtered = all.filter(
      (hit) => !hit._score || hit._score >= OPENSEARCH_SCORE_THRESHOLD
    );
    log(
      `[hybridSearch] Hits after score filter (threshold >=${OPENSEARCH_SCORE_THRESHOLD}): ${filtered.length} (out of ${all.length} raw hits)`
    );
    return filtered;
  } catch (err) {
    // It's very useful to log the body of the query that failed
    warn(
      `[hybridSearch] Error executing hybrid search:`,
      err.meta ? JSON.stringify(err.meta.body, null, 2) : err.message
    );
    warn("[hybridSearch] Failing query body:", JSON.stringify(body, null, 2));
    return [];
  }
}

/**
 * Executes the ANN plan exactly as planned:
 *  - run one HNSW search per 'search_term'
 *  - keep each step’s hits in descending score order
 *  - then interleave: step1[0], step2[0], ..., stepN[0], step1[1], step2[1], ...
 *  - dedupe by _id, preserving first appearance
 */
async function runSteps({ plan, embed, os, index }) {
  const VEC_CACHE = new Map(); // text → embedding

  async function embedOnce(text) {
    if (!VEC_CACHE.has(text)) {
      const vec = await embed(text);
      if (!Array.isArray(vec) || vec.length !== EMBED_DIM)
        throw new Error(`Bad embedding length for "${text}"`);
      VEC_CACHE.set(text, vec);
    }
    return VEC_CACHE.get(text);
  }

  // collect each step’s raw hits
  const perStepHits = [];
  for (const step of plan) {
    const term = step.search_term?.trim();
    const vector = await embedOnce(term);
    const k = step.knn_k || DEFAULT_K;

    const body = {
      size: k,
      _source: ["doc_id", "file_path", "file_type", "text_chunk"],
      query: {
        hybrid: {
          queries: [
            {
              match: {
                text_chunk: {
                  query: term,
                },
              },
            },
            {
              knn: {
                embedding: {
                  vector: vector,
                  k: k,
                },
              },
            },
          ],
        },
      },
    };

    // We now call our new function
    const hits = await hybridSearch(os, index, body);
    perStepHits.push(hits);
  }

  // interleave them
  const interleaved = [];
  const seen = new Set();
  const maxLen = Math.max(...perStepHits.map((h) => h.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const hits of perStepHits) {
      const hit = hits[i];
      if (hit && !seen.has(hit._id)) {
        seen.add(hit._id);
        interleaved.push(hit);
      }
    }
  }

  return interleaved;
}

module.exports = { runSteps };
