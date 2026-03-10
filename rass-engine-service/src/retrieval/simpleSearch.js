// rass-engine-service/src/retrieval/simpleSearch.js
// KNN + keyword hybrid search against OpenSearch with optional per-user security filtering.

const { DEFAULT_K_OPENSEARCH_HITS } = require("../config");

/**
 * Builds a hybrid KNN + keyword query.
 * When userId is provided, results are strictly scoped to that user.
 * When userId is absent (e.g. MCP tool calls), the query searches all documents.
 */
function createSecureQuery(term, vector, k, userId, documents) {
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

  const boolQuery =
    securityFilter.length > 0
      ? {
          bool: {
            filter: securityFilter,
            should: [
              {
                multi_match: {
                  query: term,
                  fields: ["text^1.0", "metadata.source^0.5"],
                  fuzziness: "AUTO",
                },
              },
              {
                knn: {
                  embedding: { vector, k },
                },
              },
            ],
            minimum_should_match: 1,
          },
        }
      : {
          bool: {
            should: [
              {
                multi_match: {
                  query: term,
                  fields: ["text^1.0", "metadata.source^0.5"],
                  fuzziness: "AUTO",
                },
              },
              {
                knn: {
                  embedding: { vector, k },
                },
              },
            ],
            minimum_should_match: 1,
          },
        };

  return {
    size: k,
    _source: ["metadata", "text"],
    query: boolQuery,
  };
}

/**
 * Executes a single hybrid KNN + keyword search against OpenSearch.
 *
 * @param {object} params
 * @param {string} params.term - The search term.
 * @param {Function} params.embed - Async function that converts text to a vector.
 * @param {object} params.os - OpenSearch client.
 * @param {string} params.index - OpenSearch index name.
 * @param {string} params.userId - User ID for scoping results.
 * @param {string[]} [params.documents] - Optional document filter list.
 * @returns {Promise<object[]>} Array of OpenSearch hit objects.
 */
async function simpleSearch({ term, embed, os, index, userId, documents }) {
  console.log(`[Simple Search] Executing for term: "${term}"`);
  if (userId) console.log(`[Simple Search] UserId: "${userId}"`);
  console.log(
    `[Simple Search] Documents filter: ${
      documents ? JSON.stringify(documents) : "none"
    }`
  );

  const vector = await embed(term);
  console.log(
    `[Simple Search] Generated embedding vector length: ${vector?.length || "undefined"}`
  );

  const k = DEFAULT_K_OPENSEARCH_HITS;
  const searchQuery = createSecureQuery(term, vector, k, userId, documents);

  try {
    const results = await os.search({ index, body: searchQuery });
    const hitCount = results.body.hits.hits.length;
    console.log(`[Simple Search] Found ${hitCount} hits (status: ${results.statusCode}).`);
    return results.body.hits.hits || [];
  } catch (error) {
    console.warn(`[Simple Search] Failed: ${error.message}`);
    console.error(`[Simple Search] Full error:`, error);
    return [];
  }
}

module.exports = { simpleSearch };
