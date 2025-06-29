const axios = require("axios");
const fs = require("fs");
const yaml = require("js-yaml");

// --- Centralized Configuration Loading ---
const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
const {
  DEFAULT_K_OPENSEARCH_HITS,
  OPENSEARCH_SCORE_THRESHOLD = 0.7,
  EMBED_DIM,
} = config;
// --- End Configuration Loading ---

const EMBEDDING_SERVICE_URL = "http://embedding-service:8001";

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

async function runSteps({ plan, embed, os, index }) {
  let allChildHits = [];

  // --- IMPROVED ROBUST SEARCH LOGIC ---
  // For each search term, perform hybrid search combining keyword and vector approaches
  for (const step of plan) {
    const term = step.search_term?.trim();
    if (!term) continue;

    const vector = await embed(term);
    const k = step.knn_k || DEFAULT_K_OPENSEARCH_HITS;

    // 1. Enhanced keyword searches with scoring boost
    const keywordQueries = [
      // Standard match query with boost
      {
        match: {
          text: {
            query: term,
            boost: 1.2,
            minimum_should_match: "75%",
          },
        },
      },
      // Match phrase for exact sequences with higher boost
      {
        match_phrase: {
          text: {
            query: term,
            slop: 2,
            boost: 1.5,
          },
        },
      },
      // Multi-match query across potential fields
      {
        multi_match: {
          query: term,
          fields: ["text^1.2", "metadata.source^0.8"],
          fuzziness: "AUTO",
          minimum_should_match: "60%",
          boost: 1.0,
        },
      },
      // Term-level query for exact matches
      {
        bool: {
          should: [
            { term: { "text.keyword": { value: term, boost: 2.0 } } },
            {
              wildcard: {
                text: { value: `*${term.toLowerCase()}*`, boost: 0.8 },
              },
            },
          ],
        },
      },
    ];

    for (const query of keywordQueries) {
      const keywordQuery = {
        size: Math.ceil(k * 0.6), // Allocate more to keyword search
        _source: ["metadata"],
        query: {
          bool: {
            must: [query],
            filter: [
              { range: { _score: { gte: OPENSEARCH_SCORE_THRESHOLD * 0.5 } } },
            ],
          },
        },
        min_score: OPENSEARCH_SCORE_THRESHOLD * 0.3,
      };

      try {
        const keywordResults = await os.search({ index, body: keywordQuery });
        if (keywordResults.body.hits.hits) {
          const filteredHits = keywordResults.body.hits.hits.filter(
            (hit) => hit._score >= OPENSEARCH_SCORE_THRESHOLD * 0.3
          );
          log(
            `[runSteps] Keyword search returned ${filteredHits.length} results above threshold`
          );
          allChildHits.push(...filteredHits);
        }
      } catch (error) {
        console.warn(
          `[runSteps] Keyword search failed for query ${JSON.stringify(
            query
          )}:`,
          error.message
        );
      }
    }

    // 2. Enhanced Vector (k-NN) search with similarity threshold
    try {
      const vectorQuery = {
        size: k,
        _source: ["metadata"],
        query: {
          knn: {
            embedding: {
              vector,
              k: k * 2, // Search more candidates
              filter: {
                range: {
                  _score: { gte: 0.1 }, // Minimum similarity threshold
                },
              },
            },
          },
        },
        min_score: 0.1, // Ensure minimum relevance
      };

      const vectorResults = await os.search({ index, body: vectorQuery });
      if (vectorResults.body.hits.hits) {
        const filteredVectorHits = vectorResults.body.hits.hits
          .filter((hit) => hit._score >= 0.2) // Higher threshold for vector search
          .slice(0, k); // Take top k after filtering

        log(
          `[runSteps] Vector search returned ${filteredVectorHits.length} results above threshold`
        );
        allChildHits.push(...filteredVectorHits);
      }
    } catch (error) {
      console.warn(`[runSteps] Vector search failed: ${error.message}`);

      // Fallback: simpler vector search without filters
      try {
        const fallbackQuery = {
          size: k,
          _source: ["metadata"],
          query: { knn: { embedding: { vector, k } } },
        };
        const fallbackResults = await os.search({ index, body: fallbackQuery });
        if (fallbackResults.body.hits.hits) {
          log(
            `[runSteps] Fallback vector search returned ${fallbackResults.body.hits.hits.length} results`
          );
          allChildHits.push(...fallbackResults.body.hits.hits);
        }
      } catch (fallbackError) {
        console.error(
          `[runSteps] Fallback vector search also failed: ${fallbackError.message}`
        );
      }
    }

    // 3. Hybrid search combining both approaches with RRF (Reciprocal Rank Fusion)
    try {
      const hybridQuery = {
        size: Math.ceil(k * 0.8),
        _source: ["metadata"],
        query: {
          bool: {
            should: [
              {
                multi_match: {
                  query: term,
                  fields: ["text^1.5"],
                  fuzziness: "AUTO",
                  boost: 0.7,
                },
              },
              {
                knn: {
                  embedding: {
                    vector,
                    k: Math.ceil(k * 0.5),
                    boost: 0.3,
                  },
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
      };

      const hybridResults = await os.search({ index, body: hybridQuery });
      if (hybridResults.body.hits.hits) {
        log(
          `[runSteps] Hybrid search returned ${hybridResults.body.hits.hits.length} results`
        );
        allChildHits.push(...hybridResults.body.hits.hits);
      }
    } catch (error) {
      console.warn(`[runSteps] Hybrid search failed: ${error.message}`);
    }
  }
  // --- END OF IMPROVED LOGIC ---

  if (allChildHits.length === 0) {
    warn("[runSteps] All search methods returned no results.");
    return [];
  }

  log(`[runSteps] Total child hits collected: ${allChildHits.length}`);

  // Enhanced de-duplication with score aggregation and source tracking
  const parentIdMap = new Map();
  const scoreAggregation = new Map(); // Track multiple scores per parent

  for (const hit of allChildHits) {
    const parentId = hit._source?.metadata?.parentId;
    if (parentId && hit._score > 0) {
      if (!parentIdMap.has(parentId)) {
        parentIdMap.set(parentId, {
          maxScore: hit._score,
          hitCount: 1,
          avgScore: hit._score,
          searchMethods: new Set(),
        });
        scoreAggregation.set(parentId, [hit._score]);
      } else {
        const existing = parentIdMap.get(parentId);
        const scores = scoreAggregation.get(parentId);

        scores.push(hit._score);
        existing.hitCount += 1;
        existing.maxScore = Math.max(existing.maxScore, hit._score);
        existing.avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        // Boost score for documents found by multiple methods
        if (existing.hitCount > 1) {
          existing.combinedScore =
            existing.maxScore * (1 + Math.log(existing.hitCount) * 0.1);
        } else {
          existing.combinedScore = existing.maxScore;
        }
      }
    }
  }

  // Sort parent documents by combined score and hit frequency
  const rankedParentIds = [...parentIdMap.keys()].sort((a, b) => {
    const scoreA =
      parentIdMap.get(a).combinedScore || parentIdMap.get(a).maxScore;
    const scoreB =
      parentIdMap.get(b).combinedScore || parentIdMap.get(b).maxScore;
    const countA = parentIdMap.get(a).hitCount;
    const countB = parentIdMap.get(b).hitCount;

    // Primary sort by combined score, secondary by hit count
    if (Math.abs(scoreA - scoreB) < 0.1) {
      return countB - countA; // More hits = better
    }
    return scoreB - scoreA; // Higher score = better
  });

  const uniqueParentIds = rankedParentIds;

  if (uniqueParentIds.length === 0) {
    warn("[runSteps] No parent IDs found in child document metadata.");
    return [];
  }

  log(
    `[runSteps] Found ${uniqueParentIds.length} unique parent documents to fetch.`
  );

  // Log top scoring documents for debugging
  const topDocs = uniqueParentIds.slice(0, 5).map((id) => ({
    id,
    score: parentIdMap.get(id)?.combinedScore || parentIdMap.get(id)?.maxScore,
    hits: parentIdMap.get(id)?.hitCount,
  }));
  log(`[runSteps] Top scoring documents:`, topDocs);

  try {
    const response = await axios.post(
      `${EMBEDDING_SERVICE_URL}/get-documents`,
      {
        ids: uniqueParentIds,
      }
    );
    const parentDocuments = response.data.documents.filter(
      (doc) => doc !== null
    );
    log(
      `[runSteps] Successfully fetched ${parentDocuments.length} parent documents.`
    );

    return parentDocuments.map((doc) => ({
      _source: {
        text: doc.pageContent,
        metadata: doc.metadata,
      },
      // Use the enhanced combined score for better reranking
      _score:
        parentIdMap.get(doc.metadata.docId)?.combinedScore ||
        parentIdMap.get(doc.metadata.docId)?.maxScore ||
        0,
      // Additional metadata for debugging/analysis
      _searchStats: {
        hitCount: parentIdMap.get(doc.metadata.docId)?.hitCount || 1,
        avgScore: parentIdMap.get(doc.metadata.docId)?.avgScore || 0,
        maxScore: parentIdMap.get(doc.metadata.docId)?.maxScore || 0,
      },
    }));
  } catch (error) {
    warn(`[runSteps] Failed to fetch parent documents: ${error.message}`);
    return [];
  }
}

module.exports = { runSteps };
