// rass-engine-service/src/retrieval/executePlan.js
// Multi-step plan execution: runs each search step, deduplicates parent IDs,
// and fetches full parent documents from the embedding service.

const axios = require("axios");
const { simpleSearch } = require("./simpleSearch");
const { EMBEDDING_SERVICE_BASE_URL } = require("../config");
const { ExecutionPlanSchema } = require("../schemas/plannerSchemas");

/**
 * Executes a multi-step search plan, deduplicates results by parent document ID,
 * and fetches the full parent documents from the embedding service.
 * Validates the input plan against ExecutionPlanSchema before execution.
 *
 * @param {object} params
 * @param {Array<{search_term: string}>} params.plan - Array of search plan steps.
 * @param {Function} params.embed - Async embedding function.
 * @param {object} params.os - OpenSearch client.
 * @param {string} params.index - OpenSearch index name.
 * @param {string} params.userId - User ID for scoping.
 * @param {string[]} [params.documents] - Optional document filter list.
 * @returns {Promise<object[]>} Array of parent document objects with text and metadata.
 */
async function runSteps({ plan, embed, os, index, userId, documents }) {
  // Validate the incoming plan — throw a descriptive error if it is malformed.
  // Build normalizedPlan first: guard against non-object steps before using `in`
  // to avoid a TypeError that would mask the schema error message.
  const normalizedPlan = plan.map((step) => {
    if (step === null || typeof step !== "object") return step;
    return "search_term" in step && !("query" in step)
      ? { ...step, query: step.search_term }
      : step;
  });
  ExecutionPlanSchema.parse(normalizedPlan);
  let allChildHits = [];

  for (const step of normalizedPlan) {
    const term = (step.query || step.search_term)?.trim();
    if (!term) continue;
    const results = await simpleSearch({ term, embed, os, index, userId, documents });
    console.log(
      `[runSteps] Refined search for "${term}" returned ${results.length} results.`
    );
    allChildHits.push(...results);
  }

  if (allChildHits.length === 0) {
    console.warn("[runSteps] All refined search steps returned no results.");
    return [];
  }
  console.log(
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
    console.warn("[runSteps] No parent IDs found in child document metadata.");
    return [];
  }

  console.log(
    `[runSteps] Found ${uniqueParentIds.length} unique parent documents to fetch.`
  );

  try {
    const response = await axios.post(
      `${EMBEDDING_SERVICE_BASE_URL}/get-documents`,
      { ids: uniqueParentIds }
    );
    const parentDocuments = response.data.documents.filter((doc) => doc !== null);
    console.log(
      `[runSteps] Successfully fetched ${parentDocuments.length} parent documents.`
    );
    return parentDocuments.map((doc) => ({
      _source: { text: doc.pageContent, metadata: doc.metadata },
      _score: parentIdMap.get(doc.metadata.docId)?._score || 0,
    }));
  } catch (error) {
    console.warn(`[runSteps] Failed to fetch parent documents: ${error.message}`);
    return [];
  }
}

module.exports = { runSteps };
