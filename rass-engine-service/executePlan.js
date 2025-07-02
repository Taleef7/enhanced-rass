// rass-engine-service/executePlan.js
const axios = require("axios");
const fs = require("fs");
const yaml = require("js-yaml");

// --- Centralized Configuration Loading ---
const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
const {
  DEFAULT_K_OPENSEARCH_HITS,
  OPENSEARCH_SCORE_THRESHOLD = 0.1, // Lowered threshold for broader initial results
} = config;
// --- End Configuration Loading ---

const EMBEDDING_SERVICE_URL = "http://embedding-service:8001";

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

async function runSteps({ plan, embed, os, index }) {
  let allChildHits = [];

  // --- SIMPLIFIED & MORE PERFORMANT SEARCH LOGIC ---
  for (const step of plan) {
    const term = step.search_term?.trim();
    if (!term) continue;

    const vector = await embed(term);
    const k = step.knn_k || DEFAULT_K_OPENSEARCH_HITS;

    // A single, powerful hybrid query using a search pipeline for Reciprocal Rank Fusion (RRF)
    const hybridQuery = {
      size: k,
      _source: ["metadata"],
      query: {
        hybrid: {
          queries: [
            {
              // 1. Keyword search component (BM25)
              multi_match: {
                query: term,
                fields: ["text^1.5", "metadata.source^0.8"], // Boost text matches
                fuzziness: "AUTO",
              },
            },
            {
              // 2. Vector search component (k-NN)
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
      min_score: OPENSEARCH_SCORE_THRESHOLD,
    };

    try {
      // Note: The 'search_pipeline' must be enabled in your OpenSearch domain settings.
      // If RRF is not enabled, this part might need adjustment.
      const results = await os.search({
        index,
        body: hybridQuery,
        search_pipeline: "hybrid-pipeline", // Assuming a pipeline named 'rrf-pipeline' is configured
      });

      if (results.body.hits.hits) {
        log(
          `[runSteps] Hybrid RRF search for "${term}" returned ${results.body.hits.hits.length} results.`
        );
        allChildHits.push(...results.body.hits.hits);
      }
    } catch (error) {
      warn(
        `[runSteps] Hybrid RRF search failed for term "${term}": ${error.message}`
      );
      // Fallback to a simple hybrid query if RRF pipeline fails or isn't configured
      try {
        const fallbackResults = await os.search({
          index,
          body: { query: hybridQuery.query },
        });
        if (fallbackResults.body.hits.hits) {
          log(
            `[runSteps] Fallback hybrid search returned ${fallbackResults.body.hits.hits.length} results.`
          );
          allChildHits.push(...fallbackResults.body.hits.hits);
        }
      } catch (fallbackError) {
        warn(
          `[runSteps] Fallback hybrid search also failed: ${fallbackError.message}`
        );
      }
    }
  }
  // --- END OF SIMPLIFIED LOGIC ---

  if (allChildHits.length === 0) {
    warn("[runSteps] All search methods returned no results.");
    return [];
  }

  log(`[runSteps] Total child hits collected: ${allChildHits.length}`);

  // --- SIMPLIFIED DE-DUPLICATION ---
  // Use a Map to automatically handle de-duplication by parentId,
  // keeping the one with the highest score.
  const parentIdMap = new Map();
  for (const hit of allChildHits) {
    const parentId = hit._source?.metadata?.parentId;
    if (parentId) {
      if (
        !parentIdMap.has(parentId) ||
        hit._score > parentIdMap.get(parentId)._score
      ) {
        parentIdMap.set(parentId, hit);
      }
    }
  }

  const uniqueParentIds = Array.from(parentIdMap.keys());
  // --- END OF SIMPLIFIED DE-DUPLICATION ---

  if (uniqueParentIds.length === 0) {
    warn("[runSteps] No parent IDs found in child document metadata.");
    return [];
  }

  log(
    `[runSteps] Found ${uniqueParentIds.length} unique parent documents to fetch.`
  );

  try {
    const response = await axios.post(
      `${EMBEDDING_SERVICE_URL}/get-documents`,
      { ids: uniqueParentIds }
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
      _score: parentIdMap.get(doc.metadata.docId)?._score || 0,
    }));
  } catch (error) {
    warn(`[runSteps] Failed to fetch parent documents: ${error.message}`);
    return [];
  }
}

module.exports = { runSteps };
