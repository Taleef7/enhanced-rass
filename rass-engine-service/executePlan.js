// rass-engine-service/executePlan.js (FINAL CORRECTED VERSION)
const axios = require("axios");
const fs = require("fs");
const yaml = require("js-yaml");

const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
const { DEFAULT_K_OPENSEARCH_HITS } = config;
const EMBEDDING_SERVICE_URL = "http://embedding-service:8001";
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

const createSecureQuery = (term, vector, k, userId, documents) => {
  const securityFilter = [{ term: { "metadata.userId.keyword": userId } }];
  if (documents && documents.length > 0) {
    securityFilter.push({ terms: { "metadata.source.keyword": documents } });
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
};

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
    `[Simple Search] Generated embedding vector length: ${
      vector?.length || "undefined"
    }`
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
    log(`[Simple Search] Found ${results.body.hits.hits.length} initial hits.`);
    return results.body.hits.hits || [];
  } catch (error) {
    warn(`[Simple Search] Failed: ${error.message}`);
    console.error(`[Simple Search] Full error:`, error);
    return [];
  }
}

async function runSteps({ plan, embed, os, index, userId, documents }) {
  let allChildHits = [];
  for (const step of plan) {
    const term = step.search_term?.trim();
    if (!term) continue;
    const results = await simpleSearch({
      term,
      embed,
      os,
      index,
      userId,
      documents,
    });
    log(
      `[runSteps] Refined search for "${term}" returned ${results.length} results.`
    );
    allChildHits.push(...results);
  }

  if (allChildHits.length === 0) {
    warn("[runSteps] All refined search steps returned no results.");
    return [];
  }
  log(
    `[runSteps] Total child hits collected after refinement: ${allChildHits.length}`
  );

  const parentIdMap = new Map();
  for (const hit of allChildHits) {
    const parentId = hit._source?.metadata?.parentId;
    if (
      parentId &&
      (!parentIdMap.has(parentId) ||
        hit._score > parentIdMap.get(parentId)._score)
    ) {
      parentIdMap.set(parentId, hit);
    }
  }

  const uniqueParentIds = Array.from(parentIdMap.keys());
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
      _source: { text: doc.pageContent, metadata: doc.metadata },
      _score: parentIdMap.get(doc.metadata.docId)?._score || 0,
    }));
  } catch (error) {
    warn(`[runSteps] Failed to fetch parent documents: ${error.message}`);
    return [];
  }
}

module.exports = { runSteps, simpleSearch };
