// rass-engine-service/agenticPlanner.js
const MAX_ITER = 6; // Keep this or make configurable via .env if needed
const DEFAULT_K_FALLBACK =
  parseInt(process.env.DEFAULT_K_OPENSEARCH_HITS, 10) || 10; // Fallback K for plan steps

/**
 * Convert a natural-language request into an ANN-only plan.
 *
 * llmClient: Initialized OpenAI or Gemini client instance.
 * llmProvider: String "openai" or "gemini".
 * openaiPlannerModel: String model name for OpenAI.
 * geminiPlannerModel: String model name for Gemini. (Note: `geminiPlannerModel` is not directly used here as `llmClient` is already the model instance for Gemini)
 * query: User's natural language query.
 * history: Array of previous interactions (optional).
 */
async function buildPlan(
  llmClient,
  llmProvider,
  openaiPlannerModel,
  query,
  history = []
) {
  const sysPromptForOpenAI = `
You are an expert OpenSearch strategist. Return exactly a single JSON object matching the function signature 'build_plan'.
Do not add any commentary before or after the JSON object.

### Output JSON Structure
\`\`\`json
{
  "intent": ["find documents relating to specified entities"],
  "plan": [
    {"step_id": "e1", "search_term": "extracted entity or relevant concept 1", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e2", "search_term": "expanded or related term for concept 1", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e3", "search_term": "extracted entity or relevant concept 2", "knn_k": ${DEFAULT_K_FALLBACK}}
  ]
}
\`\`\`

### Task
Generate a search plan for the "Current Query".

### Iterative Refinement Based on History
The "History" array shows previous attempts for the current query. Each entry includes:
- "iteration": The iteration number.
- "plan_attempted": The plan that was tried.
- "outcome": Feedback on the plan. **If this feedback states "0 hits" or asks for a "significantly different plan", you MUST generate a NEW plan with DIFFERENT search terms and/or a different strategy.** Do NOT repeat search terms from previously failed plans. Analyze the "plan_attempted" from history to avoid repetition and to inspire new search avenues. Expand your thinking to synonyms, related concepts, or alternative phrasings.

### Examples of Plans (Illustrative)
Query: "get me records for Juli and the documents having the mention of terms containing Borne"
Output:
{
  "intent": ["find documents relating to specified entities"],
  "plan": [
    {"step_id": "e1", "search_term": "Juli", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e2", "search_term": "Borne", "knn_k": ${DEFAULT_K_FALLBACK}}
  ]
}

Query: "heart disease reports"
Output:
{
  "intent": ["find documents relating to specified entities"],
  "plan": [
    {"step_id": "e1", "search_term": "heart disease", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e2", "search_term": "cardiac disorder", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e3", "search_term": "cardiovascular disease", "knn_k": ${DEFAULT_K_FALLBACK}}
  ]
}

### Current Context
Current Query: ${query}
History: ${JSON.stringify(history, null, 2)} 
`.trim();

  // Simplified prompt for Gemini, asking for direct JSON output (no function calling yet)
  const sysPromptForGemini = `
You are an expert OpenSearch strategist. Your task is to analyze the user's query and generate a JSON object.
The JSON object should contain an "intent" (e.g., "find documents relating to specified entities") and a "plan".
The "plan" should be an array of search steps. Each step must have a "step_id" (e.g., "e1", "e2"), a "search_term", and a "knn_k" (default to ${DEFAULT_K_FALLBACK}).
Generate multiple relevant search terms, including synonyms or expansions if appropriate.
Return ONLY the JSON object, with no commentary before or after it.

Example User Query: "heart disease reports"
Example JSON Output:
{
  "intent": ["find documents relating to specified entities"],
  "plan": [
    {"step_id": "e1", "search_term": "heart disease", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e2", "search_term": "cardiac disorder", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e3", "search_term": "cardiovascular disease", "knn_k": ${DEFAULT_K_FALLBACK}}
  ]
}

User Query: "${query}"
History: ${JSON.stringify(history)}
Provide the JSON plan:
`.trim();

  let llmResponseContent;

  try {
    if (llmProvider === "openai") {
      const functions = [
        {
          name: "build_plan",
          description:
            "Extract intent and produce an ANN plan with search terms and k values.",
          parameters: {
            type: "object",
            properties: {
              intent: {
                type: "array",
                items: { type: "string" },
                description: "Detected intent",
              },
              plan: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    step_id: { type: "string" },
                    search_term: { type: "string" },
                    knn_k: { type: "integer" },
                  },
                  required: ["step_id", "search_term", "knn_k"],
                },
                description: "Ordered ANN search steps",
              },
            },
            required: ["intent", "plan"],
          },
        },
      ];

      console.log(`[BuildPlan] Using OpenAI model: ${openaiPlannerModel}`);
      const resp = await llmClient.chat.completions.create({
        model: openaiPlannerModel, // Use configured OpenAI model
        temperature: 0.3,
        messages: [
          { role: "system", content: sysPromptForOpenAI },
          // User prompt is now part of the system prompt for OpenAI function calling structure
        ],
        functions,
        function_call: { name: "build_plan" },
      });

      const msg = resp.choices[0].message;
      if (msg.function_call?.name === "build_plan") {
        llmResponseContent = msg.function_call.arguments;
      } else {
        console.warn(
          "[BuildPlan-OpenAI] Did not receive expected function call. Response:",
          JSON.stringify(resp.choices[0], null, 2)
        );
        // Try to parse content if available as a fallback
        llmResponseContent = msg.content;
      }
    } else if (llmProvider === "gemini") {
      // llmClient for Gemini is already the specific model instance
      console.log(`[BuildPlan] Using Gemini model (client instance)`);
      const result = await llmClient.generateContent(sysPromptForGemini); // Gemini prompt includes the query
      const response = result.response;
      llmResponseContent = response.text();
      console.log("[BuildPlan-Gemini] Raw text response:", llmResponseContent);
    } else {
      throw new Error(`Unsupported LLM provider in buildPlan: ${llmProvider}`);
    }

    if (!llmResponseContent) {
      console.warn("[BuildPlan] LLM response content was empty or undefined.");
      throw new Error("LLM returned no content for plan.");
    }

    // Attempt to parse the JSON content
    // For Gemini, we need to be careful as it might include ```json ... ``` markers
    let parsableJson = llmResponseContent;
    if (typeof llmResponseContent === "string") {
      const jsonMatch = llmResponseContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        parsableJson = jsonMatch[1];
      }
    }

    return JSON.parse(parsableJson);
  } catch (e) {
    console.error(
      "[BuildPlan] Error processing LLM response or parsing JSON:",
      e.message
    );
    console.error(
      "Raw LLM response content that failed parsing (if available):",
      llmResponseContent
    ); // Log the raw content
    // Fallback plan
    return {
      intent: ["find documents (fallback due to planner error)"],
      plan: [
        {
          step_id: "e1",
          search_term: query,
          knn_k: DEFAULT_K_FALLBACK,
          is_final: true,
        },
      ],
    };
  }
}

// planAndExecute function remains largely the same, but receives llmClient and provider info
// Inside rass-engine-service/agenticPlanner.js
// Within the planAndExecute function:

async function planAndExecute({
  query,
  llmClient,
  llmProvider,
  openaiPlannerModel,
  osClient,
  indexName,
  embedTextFn,
  runStepsFn,
}) {
  const history = [];
  for (let iter = 0; iter < MAX_ITER; ++iter) {
    console.log(`[PlanAndExecute] Iteration: ${iter + 1}, Query: "${query}"`);
    // Pass the openaiPlannerModel explicitly to buildPlan if llmProvider is openai
    const planObj = await buildPlan(
      llmClient,
      llmProvider,
      openaiPlannerModel,
      query,
      history
    );

    if (
      !planObj ||
      !planObj.plan ||
      !Array.isArray(planObj.plan) ||
      planObj.plan.length === 0
    ) {
      console.warn(
        "[PlanAndExecute] Invalid or empty plan received from buildPlan. Using fallback query for this iteration."
      );
      const fallbackPlan = [
        {
          step_id: `fallback_iter${iter + 1}_e1`,
          search_term: query,
          knn_k: DEFAULT_K_FALLBACK,
        },
      ];
      planObj.plan = fallbackPlan; // Use fallback for this iteration if plan is bad
    }
    console.log(
      "[PlanAndExecute] Generated plan:",
      JSON.stringify(planObj.plan, null, 2)
    );

    const hits = await runStepsFn({
      plan: planObj.plan,
      embed: embedTextFn,
      os: osClient,
      index: indexName,
    });

    // --- MODIFICATION START ---
    let iteration_feedback = "";
    if (hits.length === 0) {
      iteration_feedback = `Iteration ${
        iter + 1
      } using the plan above resulted in 0 hits. Please generate a new plan with significantly different search terms or a new strategy. Do not repeat previously failed search terms.`;
    } else {
      iteration_feedback = `Iteration ${
        iter + 1
      } using the plan above resulted in ${hits.length} hits.`;
    }

    history.push({
      iteration: iter + 1,
      plan_attempted: planObj.plan, // Renamed for clarity
      outcome: iteration_feedback, // More descriptive outcome
      retrieved_hit_count: hits.length, // Keep this for other potential uses
    });
    // --- MODIFICATION END ---

    if (hits.length) {
      console.log(
        `[PlanAndExecute] Found ${
          hits.length
        } hits after running plan. Iteration ${iter + 1}.`
      );
      return hits;
    }
    console.log(
      `[PlanAndExecute] No hits found in iteration ${
        iter + 1
      }. History for next iteration: ${JSON.stringify(
        history[history.length - 1]
      )}`
    ); // Log last history item
    if (iter === MAX_ITER - 1) {
      // Check if it's the last iteration
      console.warn("[PlanAndExecute] Max iterations reached with no hits.");
    }
  }
  return [];
}

module.exports = { buildPlan, planAndExecute };
