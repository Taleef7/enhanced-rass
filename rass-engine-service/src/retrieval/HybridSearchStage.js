// rass-engine-service/src/retrieval/HybridSearchStage.js
// Executes a KNN + BM25 hybrid search against OpenSearch using the pre-computed query embedding.
// Phase 1.2: Per-KB index routing — each KB maps to its own OpenSearch index.
// Phase 2.2: Uses OpenSearch normalization pipeline for proper hybrid score fusion
//            (min_max normalization + weighted arithmetic mean: 0.7 KNN, 0.3 BM25).
//            Falls back to bool.should combination if the pipeline is unavailable.
// Stores raw OpenSearch hits in context.candidateChunks.

"use strict";

const { Stage } = require("./Stage");
const { DEFAULT_K_OPENSEARCH_HITS, OPENSEARCH_INDEX_NAME } = require("../config");
const { osClient } = require("../clients/opensearchClient");
const logger = require("../logger");
const { withSpan } = require("../tracing");
const { opensearchQueryDurationSeconds } = require("../metrics");

// ── Hybrid Search Pipeline (OpenSearch 2.10+ normalization) ───────────────────

const PIPELINE_ID = "rass-hybrid-pipeline";
let pipelineReady = false;
let pipelineInitAttempted = false;

/**
 * Creates (or updates) the rass-hybrid-pipeline search pipeline in OpenSearch.
 * Uses min_max normalization + arithmetic_mean combination (0.3 BM25, 0.7 KNN).
 * Called once at construction time; subsequent calls are no-ops.
 */
async function ensureHybridSearchPipeline() {
  if (pipelineInitAttempted) return;
  pipelineInitAttempted = true;

  try {
    await osClient.transport.request({
      method: "PUT",
      path: `/_search/pipeline/${PIPELINE_ID}`,
      body: {
        description:
          "RASS hybrid search: min-max normalization + weighted arithmetic mean (0.3 BM25, 0.7 KNN)",
        phase_results_processors: [
          {
            "normalization-processor": {
              normalization: { technique: "min_max" },
              combination: {
                technique: "arithmetic_mean",
                // weights order must match the order of queries in the hybrid clause:
                // index 0 → BM25 (multi_match), index 1 → KNN
                parameters: { weights: [0.3, 0.7] },
              },
            },
          },
        ],
      },
    });
    pipelineReady = true;
    logger.info(
      `[HybridSearchStage] Hybrid search normalization pipeline ready: ${PIPELINE_ID}`
    );
  } catch (err) {
    logger.warn(
      `[HybridSearchStage] Could not create hybrid search pipeline (${err.message}). ` +
        "Falling back to bool.should score combination."
    );
    pipelineReady = false;
  }
}

// ── Security filter builder ───────────────────────────────────────────────────

function buildSecurityFilters(userId, documents) {
  const filters = [];

  if (userId) {
    filters.push({
      bool: {
        should: [
          { term: { "metadata.userId.keyword": userId } },
          { term: { "metadata.userId": userId } },
          { match_phrase: { "metadata.userId": userId } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (documents && documents.length > 0) {
    filters.push({
      bool: {
        should: [
          { terms: { "metadata.source.keyword": documents } },
          { terms: { "metadata.source": documents } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  return filters.length > 0 ? filters : null;
}

// ── Query builders ────────────────────────────────────────────────────────────

/**
 * Builds a native OpenSearch hybrid query (requires normalization pipeline).
 * Security filters are applied within each sub-query — the hybrid query type
 * does not support a top-level filter clause.
 */
function buildNativeHybridQuery(query, vector, k, userId, documents) {
  const securityFilters = buildSecurityFilters(userId, documents);

  // BM25 sub-query (weight 0.3)
  const bm25Query = securityFilters
    ? {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ["text^1.0", "metadata.source^0.5"],
                fuzziness: "AUTO",
              },
            },
          ],
          filter: securityFilters,
        },
      }
    : {
        multi_match: {
          query,
          fields: ["text^1.0", "metadata.source^0.5"],
          fuzziness: "AUTO",
        },
      };

  // KNN sub-query (weight 0.7)
  const knnQuery = securityFilters
    ? {
        bool: {
          must: [{ knn: { embedding: { vector, k } } }],
          filter: securityFilters,
        },
      }
    : {
        knn: {
          embedding: { vector, k },
        },
      };

  return {
    size: k,
    _source: ["metadata", "text"],
    query: {
      hybrid: {
        queries: [bm25Query, knnQuery],
      },
    },
  };
}

/**
 * Builds the legacy bool.should query (fallback when the pipeline is unavailable).
 * Equivalent to the pre-2.2 implementation.
 */
function buildFallbackHybridQuery(query, vector, k, userId, documents) {
  const securityFilters = buildSecurityFilters(userId, documents);

  const shouldClauses = [
    {
      multi_match: {
        query,
        fields: ["text^1.0", "metadata.source^0.5"],
        fuzziness: "AUTO",
      },
    },
    {
      knn: {
        embedding: { vector, k },
      },
    },
  ];

  const boolQuery = securityFilters
    ? {
        bool: {
          filter: securityFilters,
          should: shouldClauses,
          minimum_should_match: 1,
        },
      }
    : {
        bool: {
          should: shouldClauses,
          minimum_should_match: 1,
        },
      };

  return {
    size: k,
    _source: ["metadata", "text"],
    query: boolQuery,
  };
}

// ── Stage ─────────────────────────────────────────────────────────────────────

class HybridSearchStage extends Stage {
  constructor() {
    super("HybridSearchStage");
    // Fire-and-forget: pipeline creation completes asynchronously.
    // First queries will use the fallback path; subsequent ones use the pipeline.
    ensureHybridSearchPipeline().catch(() => {});
  }

  async run(context) {
    const { query, queryEmbedding, userId, documents, kbId } = context;
    const k = DEFAULT_K_OPENSEARCH_HITS;

    if (!queryEmbedding) {
      logger.warn(
        "[HybridSearchStage] No queryEmbedding found; returning empty candidates."
      );
      context.candidateChunks = [];
      return context;
    }

    // Phase 1.2: Per-KB index routing
    const targetIndex = kbId ? `rass-kb-${kbId}` : OPENSEARCH_INDEX_NAME;
    if (kbId) {
      logger.info(`[HybridSearchStage] Routing to per-KB index: ${targetIndex}`);
    }

    return withSpan(
      "retrieval.hybridSearch",
      {
        "search.k": k,
        "search.hasUserFilter": !!userId,
        "search.index": targetIndex,
        "search.pipeline": pipelineReady ? PIPELINE_ID : "fallback",
      },
      async () => {
        const searchStart = Date.now();

        // Phase 2.2: Prefer native hybrid query with normalization pipeline.
        // Retry with fallback bool.should if the hybrid query itself fails.
        let hits = await this._searchWithPipeline(
          targetIndex, query, queryEmbedding, k, userId, documents
        );

        opensearchQueryDurationSeconds.observe(
          { operation: "hybrid_search" },
          (Date.now() - searchStart) / 1000
        );

        logger.info(
          `[HybridSearchStage] Found ${hits.length} candidate chunks in "${targetIndex}" ` +
            `(mode: ${pipelineReady ? "native-hybrid" : "bool-should"}).`
        );
        context.candidateChunks = hits;
        return context;
      }
    );
  }

  /**
   * Attempts native hybrid search first; falls back to bool.should on failure.
   */
  async _searchWithPipeline(targetIndex, query, queryEmbedding, k, userId, documents) {
    if (pipelineReady) {
      try {
        const searchBody = buildNativeHybridQuery(
          query, queryEmbedding, k, userId, documents
        );
        // Use transport.request to reliably pass search_pipeline as a query param
        const results = await osClient.transport.request({
          method: "POST",
          path: `/${encodeURIComponent(targetIndex)}/_search?search_pipeline=${encodeURIComponent(PIPELINE_ID)}`,
          body: searchBody,
        });
        return results.body.hits.hits || [];
      } catch (err) {
        logger.warn(
          `[HybridSearchStage] Native hybrid query failed (${err.message}); ` +
            "retrying with bool.should fallback."
        );
        // Disable pipeline for future requests to avoid repeated failures
        pipelineReady = false;
      }
    }

    // Fallback: legacy bool.should
    try {
      const searchBody = buildFallbackHybridQuery(
        query, queryEmbedding, k, userId, documents
      );
      const results = await osClient.search({ index: targetIndex, body: searchBody });
      return results.body.hits.hits || [];
    } catch (err) {
      logger.warn(
        `[HybridSearchStage] Fallback search also failed on "${targetIndex}": ${err.message}`
      );
      return [];
    }
  }
}

module.exports = { HybridSearchStage };
