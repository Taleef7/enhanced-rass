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

### Output format
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

### Examples
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

Query: "COVID-19 cases in Seattle 2021"
Output:
{
  "intent": ["find documents relating to specified entities"],
  "plan": [
    {"step_id": "e1", "search_term": "COVID-19 cases in Seattle 2021", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e2", "search_term": "COVID-19 Seattle", "knn_k": ${DEFAULT_K_FALLBACK}},
    {"step_id": "e3", "search_term": "coronavirus cases in Seattle 2021", "knn_k": ${DEFAULT_K_FALLBACK}}
  ]
}
Current Query: ${query}
History: ${JSON.stringify(history)}
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
async function planAndExecute({
  query,
  llmClient, // Now receives the initialized client
  llmProvider, // Receives "openai" or "gemini"
  openaiPlannerModel, // Specific model name if OpenAI
  // geminiPlannerModel is implicit in the gemini llmClient instance
  osClient,
  indexName,
  // mappings = null, // Mappings check moved to service startup
  embedTextFn, // Renamed for clarity, this is the provider-aware embedText from index.js
  runStepsFn,
}) {
  // Optional: Mappings check can be added here if needed, but better at service start
  // if (mappings) { ... }

  const history = [];
  for (let iter = 0; iter < MAX_ITER; ++iter) {
    console.log(`[PlanAndExecute] Iteration: ${iter + 1}, Query: "${query}"`);
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
        "[PlanAndExecute] Invalid or empty plan received from buildPlan. Using fallback query."
      );
      // Use original query as a single search term if plan is bad
      const fallbackPlan = [
        {
          step_id: "fallback_e1",
          search_term: query,
          knn_k: DEFAULT_K_FALLBACK,
        },
      ];
      planObj.plan = fallbackPlan; // Corrected this line
    }
    console.log(
      "[PlanAndExecute] Generated plan:",
      JSON.stringify(planObj.plan, null, 2)
    );

    const hits = await runStepsFn({
      plan: planObj.plan,
      embed: embedTextFn, // Pass the correctly named function
      os: osClient,
      index: indexName,
      // Pass EMBED_DIM from .env to runSteps if it needs it for validation (your current runSteps uses it from its own process.env)
      // embedDim: Number(process.env.EMBED_DIM) // Or pass it explicitly
    });

    history.push({
      iteration: iter + 1,
      plan_generated: planObj.plan,
      retrieved_hit_count: hits.length,
    });

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
      }. Continuing if MAX_ITER not reached.`
    );
  }

  console.warn("[PlanAndExecute] Max iterations reached with no hits.");
  return []; // Return empty array if no hits after max iterations
}

module.exports = { buildPlan, planAndExecute };
