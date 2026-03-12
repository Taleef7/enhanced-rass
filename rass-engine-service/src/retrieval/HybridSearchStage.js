// rass-engine-service/src/retrieval/HybridSearchStage.js
// Executes a KNN + BM25 hybrid search against OpenSearch using the pre-computed query embedding.
// Stores raw OpenSearch hits in context.candidateChunks.

"use strict";

const { Stage } = require("./Stage");
const { DEFAULT_K_OPENSEARCH_HITS, OPENSEARCH_INDEX_NAME } = require("../config");
const { osClient } = require("../clients/opensearchClient");

/**
 * Builds a hybrid KNN + keyword OpenSearch query.
 * When userId is provided, results are strictly scoped to that user.
 */
function buildHybridQuery(query, vector, k, userId, documents) {
  const securityFilter = [];

  if (userId) {
    securityFilter.push({
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
    securityFilter.push({
      bool: {
        should: [
          { terms: { "metadata.source.keyword": documents } },
          { terms: { "metadata.source": documents } },
        ],
        minimum_should_match: 1,
      },
    });
  }

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

  const boolQuery =
    securityFilter.length > 0
      ? {
          bool: {
            filter: securityFilter,
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

class HybridSearchStage extends Stage {
  constructor() {
    super("HybridSearchStage");
  }

  async run(context) {
    const { query, queryEmbedding, userId, documents } = context;
    const k = DEFAULT_K_OPENSEARCH_HITS;

    if (!queryEmbedding) {
      console.warn("[HybridSearchStage] No queryEmbedding found; returning empty candidates.");
      context.candidateChunks = [];
      return context;
    }

    const searchBody = buildHybridQuery(query, queryEmbedding, k, userId, documents);

    try {
      const results = await osClient.search({ index: OPENSEARCH_INDEX_NAME, body: searchBody });
      const hits = results.body.hits.hits || [];
      console.log(`[HybridSearchStage] Found ${hits.length} candidate chunks (status: ${results.statusCode}).`);
      context.candidateChunks = hits;
    } catch (error) {
      console.warn(`[HybridSearchStage] Search failed: ${error.message}`);
      context.candidateChunks = [];
    }

    return context;
  }
}

module.exports = { HybridSearchStage };
