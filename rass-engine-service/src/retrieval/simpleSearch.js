// rass-engine-service/src/retrieval/simpleSearch.js
// KNN + keyword hybrid search against OpenSearch with per-user security filtering.

const { DEFAULT_K_OPENSEARCH_HITS } = require("../config");

/**
 * Builds a hybrid KNN + keyword query with user-scope and optional document filters.
 */
function createSecureQuery(term, vector, k, userId, documents) {
  const userIdFilter = {
    bool: {
      should: [
        { term: { "metadata.userId.keyword": userId } },
        { term: { "metadata.userId": userId } },
        { match_phrase: { "metadata.userId": userId } },
      ],
      minimum_should_match: 1,
    },
  };

  const securityFilter = [userIdFilter];
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

  return {
    size: k,
    _source: ["metadata", "text"],
    query: {
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
              embedding: {
                vector: vector,
                k: k,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
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
  console.log(`[Simple Search] UserId: "${userId}"`);
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

  console.log(
    `[Simple Search] Search query:`,
    JSON.stringify(searchQuery, null, 2)
  );

  try {
    console.log(`[Simple Search] About to execute search with index: ${index}`);
    const results = await os.search({ index, body: searchQuery });
    console.log(
      `[Simple Search] OpenSearch response status:`,
      results.statusCode
    );
    console.log(
      `[Simple Search] OpenSearch response body hits:`,
      JSON.stringify(results.body.hits, null, 2)
    );
    console.log(
      `[Simple Search] Found ${results.body.hits.hits.length} initial hits.`
    );
    return results.body.hits.hits || [];
  } catch (error) {
    console.warn(`[Simple Search] Failed: ${error.message}`);
    console.error(`[Simple Search] Full error:`, error);
    return [];
  }
}

module.exports = { simpleSearch };
