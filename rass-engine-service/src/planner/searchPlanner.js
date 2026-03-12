// rass-engine-service/src/planner/searchPlanner.js
// Context-aware search planner — uses the LLM to generate refined search terms
// based on an initial retrieval context.
//
// TODO: The createRefinedSearchPlan() integration is currently commented out in
// routes/streamAsk.js. Uncomment the refinedPlan block there to activate two-stage retrieval.

const { DEFAULT_K_OPENSEARCH_HITS } = require("../config");
const { llmClient } = require("../clients/llmClient");
const { LLM_PROVIDER, OPENAI_MODEL_NAME, GEMINI_MODEL_NAME } = require("../config");
const { SearchPlanSchema } = require("../schemas/plannerSchemas");
const logger = require("../logger");

/**
 * Generates a refined set of search terms from the LLM given an initial context.
 * Validates the LLM output against SearchPlanSchema; falls back to [originalQuery] on failure.
 *
 * @param {string} originalQuery - The user's original query.
 * @param {string} initialContext - Text from the initial retrieval pass.
 * @returns {Promise<Array<{step_id: string, search_term: string, knn_k: number}>>}
 */
async function createRefinedSearchPlan(originalQuery, initialContext) {
  logger.info(
    `[Refined Plan] Creating context-aware search plan for: "${originalQuery}"`
  );

  const planningPrompt = `You are a search query refinement expert. Based on the user's original query and the provided initial search results, generate a JSON array of 3-4 new, highly specific search terms that will find the definitive answer.

Focus on extracting key entities, concepts, and relationships from the initial context.

User Query: "${originalQuery}"

Initial Context:
---
${initialContext}
---

Generate a JSON array of specific search terms now. Your entire response must be ONLY the JSON array.`;

  try {
    let rawTerms;
    if (LLM_PROVIDER === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: OPENAI_MODEL_NAME,
        messages: [{ role: "user", content: planningPrompt }],
        temperature: 0.5,
      });
      rawTerms = JSON.parse(completion.choices[0].message.content);
    } else {
      const result = await llmClient.generateContent(planningPrompt);
      const response = result.response.text();
      rawTerms = JSON.parse(response);
    }

    // Validate the LLM output against SearchPlanSchema
    const planResult = SearchPlanSchema.safeParse(rawTerms);
    if (!planResult.success) {
      logger.warn(
        `[Refined Plan] LLM output failed schema validation: ${JSON.stringify(planResult.error.issues)}. Falling back to original query.`
      );
      return [
        {
          step_id: "fallback_original",
          search_term: originalQuery,
          knn_k: DEFAULT_K_OPENSEARCH_HITS,
        },
      ];
    }

    const plan = planResult.data.map((term, index) => ({
      step_id: `refined_search_${index + 1}`,
      search_term: term.trim(),
      knn_k: DEFAULT_K_OPENSEARCH_HITS,
    }));

    logger.info(`[Refined Plan] Created ${plan.length} new search steps.`);
    return plan;
  } catch (error) {
    logger.warn(
      `[Refined Plan] Could not create refined plan, falling back to original query.`
    );
    return [
      {
        step_id: "fallback_original",
        search_term: originalQuery,
        knn_k: DEFAULT_K_OPENSEARCH_HITS,
      },
    ];
  }
}

module.exports = { createRefinedSearchPlan };
