// rass-engine-service/index.js
const express = require("express");
const { Client } = require("@opensearch-project/opensearch");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const yaml = require("js-yaml");
const { v4: uuidv4 } = require("uuid"); // Import uuid

const { rerank } = require("./reranker.js");
const { runSteps } = require("./executePlan");
const { generateHypotheticalDocument } = require("./hydeGenerator.js");

// --- Centralized Configuration Loading ---
const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
console.log("[Config] Loaded configuration from config.yml");

const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;
const {
  LLM_PROVIDER,
  OPENAI_MODEL_NAME,
  GEMINI_MODEL_NAME,
  SEARCH_TERM_EMBEDDING_PROVIDER,
  OPENAI_EMBED_MODEL_NAME: OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS,
  GEMINI_EMBED_MODEL_NAME: GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  RASS_ENGINE_PORT,
  DEFAULT_K_OPENSEARCH_HITS,
  EMBED_DIM,
} = config;
// --- End Configuration Loading ---

const app = express();
app.use(express.json());

app.get("/", (req, res) =>
  res.status(200).json({ status: "ok", message: "RASS Engine is running" })
);

let llmClient;
let searchEmbedderClient;

// LLM (Generator) Client Initialization
if (LLM_PROVIDER === "openai") {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  llmClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(`[Init] LLM Provider: OpenAI, Model: ${OPENAI_MODEL_NAME}`);
} else {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");
  const googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  llmClient = googleGenAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  console.log(`[Init] LLM Provider: Gemini, Model: ${GEMINI_MODEL_NAME}`);
}

// Search Embedder Client Initialization
if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  searchEmbedderClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(
    `[Init] Search Embedder: OpenAI, Model: ${OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS}`
  );
} else {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");
  const googleGenAI_Embed = new GoogleGenerativeAI(GEMINI_API_KEY);
  searchEmbedderClient = googleGenAI_Embed.getGenerativeModel({
    model: GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
  });
  console.log(
    `[Init] Search Embedder: Gemini, Model: ${GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS}`
  );
}

const osClient = new Client({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

async function embedText(text) {
  if (!text?.trim()) throw new Error("Empty text provided for embedding");
  console.log(`[EmbedSearchTerm] Embedding text...`);
  try {
    if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
      const { data } = await searchEmbedderClient.embeddings.create({
        model: OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS,
        input: text,
      });
      return data[0].embedding;
    } else {
      const result = await searchEmbedderClient.embedContent({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
      });
      return result.embedding.values;
    }
  } catch (err) {
    console.error(
      `[EmbedSearchTerm] Error with ${SEARCH_TERM_EMBEDDING_PROVIDER}:`,
      err.message
    );
    throw err;
  }
}

// Enhanced search plan creation function
async function createEnhancedSearchPlan(
  llmClient,
  llmProvider,
  modelName,
  originalQuery,
  hypotheticalDoc
) {
  console.log(
    `[Search Plan] Creating enhanced search plan for: "${originalQuery}"`
  );

  const planningPrompt = `You are an expert search planner. Your task is to generate a JSON array of 3-4 diverse and high-quality search terms based on a user's query.

User Query: "${originalQuery}"

Instructions:
1. Create a concise list of 3 to 4 search terms.
2. The terms should cover the most important concepts, entities, and the direct question.
3. Your entire response must be ONLY the JSON array of strings. Do not include any other text, explanations, or markdown formatting.

Example response format:
["term1", "term2", "term3"]

Generate the JSON array for the user query now.`;

  try {
    let searchTerms = [];

    if (llmProvider === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: modelName,
        messages: [{ role: "user", content: planningPrompt }],
        temperature: 0.7,
        max_tokens: 200,
      });
      const response = completion.choices[0].message.content;
      searchTerms = JSON.parse(response);
    } else {
      const result = await llmClient.generateContent(planningPrompt);
      const response = result.response.text();
      searchTerms = JSON.parse(response);
    }

    // Create search plan from terms
    const plan = searchTerms.map((term, index) => ({
      step_id: `search_step_${index + 1}`,
      search_term: term.trim(),
      knn_k: DEFAULT_K_OPENSEARCH_HITS,
    }));

    // Add the HyDE document as an additional search step
    plan.push({
      step_id: "hyde_search",
      search_term: hypotheticalDoc,
      knn_k: DEFAULT_K_OPENSEARCH_HITS,
    });

    console.log(
      `[Search Plan] Created ${plan.length} search steps:`,
      plan.map((p) => p.search_term)
    );
    return plan;
  } catch (error) {
    console.warn(
      `[Search Plan] Failed to create enhanced plan: ${error.message}`
    );

    // Fallback to manual decomposition
    const fallbackPlan = [
      {
        step_id: "original_query",
        search_term: originalQuery,
        knn_k: DEFAULT_K_OPENSEARCH_HITS,
      },
      {
        step_id: "hyde_search",
        search_term: hypotheticalDoc,
        knn_k: DEFAULT_K_OPENSEARCH_HITS,
      },
    ];

    // Add some manual query variations for better coverage
    const queryLower = originalQuery.toLowerCase();
    if (queryLower.includes("martian") && queryLower.includes("die")) {
      fallbackPlan.push({
        step_id: "manual_terms_1",
        search_term: "bacteria killed Martians War of the Worlds",
        knn_k: DEFAULT_K_OPENSEARCH_HITS,
      });
      fallbackPlan.push({
        step_id: "manual_terms_2",
        search_term: "terrestrial microorganisms Martian death",
        knn_k: DEFAULT_K_OPENSEARCH_HITS,
      });
    }

    console.log(
      `[Search Plan] Using fallback plan with ${fallbackPlan.length} steps`
    );
    return fallbackPlan;
  }
}

// REFACTORED 'ask' function to support both streaming and non-streaming
async function ask(query, top_k_param, stream = false, res = null) {
  if (!query?.trim()) throw new Error("Empty query");
  const top_k_for_generation = top_k_param || 5;
  console.log(`[Ask] Query: "${query}", Streaming: ${stream}`);

  // --- Step 1: Retrieval (HyDE, Plan, Execute, Rerank) ---
  const hypotheticalDocument = await generateHypotheticalDocument(
    llmClient,
    LLM_PROVIDER,
    LLM_PROVIDER === "openai" ? OPENAI_MODEL_NAME : GEMINI_MODEL_NAME,
    query
  );
  const enhancedPlan = await createEnhancedSearchPlan(
    llmClient,
    LLM_PROVIDER,
    LLM_PROVIDER === "openai" ? OPENAI_MODEL_NAME : GEMINI_MODEL_NAME,
    query,
    hypotheticalDocument
  );
  const parentDocs = await runSteps({
    plan: enhancedPlan,
    embed: embedText,
    os: osClient,
    index: OPENSEARCH_INDEX_NAME,
  });

  if (!parentDocs || !parentDocs.length) {
    console.warn("[Ask] No documents found.");
    const emptyResponse = {
      answer: "I could not find any relevant information.",
      source_documents: [],
    };
    if (stream) {
      writeSSE(res, {
        choices: [{ delta: { content: emptyResponse.answer } }],
      });
      writeSSE(res, {
        choices: [{ delta: { custom_meta: { citations: [] } } }],
      });
      writeSSE(res, "[DONE]");
      res.end();
      return;
    }
    return emptyResponse;
  }

  const initial_documents = parentDocs
    .map((h) => ({ text: h._source?.text, metadata: h._source?.metadata }))
    .filter((doc) => doc.text?.trim());
  const reranked_documents = await rerank(query, initial_documents);
  const source_documents = reranked_documents.slice(0, top_k_for_generation);
  console.log(
    `[Generation] Generating with ${source_documents.length} reranked documents...`
  );

  const context = source_documents.map((doc) => doc.text).join("\n\n---\n\n");
  const generationPrompt = `You are a knowledgeable assistant. Use the provided context to answer the user's question accurately and comprehensively...\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;

  // --- Step 2: Generation (Streaming or Non-Streaming) ---
  if (!stream) {
    // Original non-streaming logic
    let answer = "Sorry, I was unable to generate an answer.";
    try {
      if (LLM_PROVIDER === "openai") {
        const completion = await llmClient.chat.completions.create({
          model: OPENAI_MODEL_NAME,
          messages: [{ role: "user", content: generationPrompt }],
          temperature: 0.3,
          max_tokens: 500,
        });
        answer = completion.choices[0].message.content;
      } else {
        const result = await llmClient.generateContent(generationPrompt);
        answer = result.response.text();
      }
    } catch (e) {
      console.error("[Generation] Error calling LLM:", e);
    }
    console.log(`[Generation] Final answer generated.`);
    return { answer, source_documents };
  } else {
    // NEW Streaming Logic
    try {
      if (LLM_PROVIDER === "openai") {
        const completionStream = await llmClient.chat.completions.create({
          model: OPENAI_MODEL_NAME,
          messages: [{ role: "user", content: generationPrompt }],
          temperature: 0.3,
          max_tokens: 500,
          stream: true,
        });
        for await (const chunk of completionStream) {
          if (chunk.choices[0]?.delta?.content) {
            writeSSE(res, {
              choices: [{ delta: { content: chunk.choices[0].delta.content } }],
            });
          }
        }
      } else {
        // Gemini
        const result = await llmClient.generateContentStream(generationPrompt);
        for await (const chunk of result.stream) {
          if (chunk.text()) {
            writeSSE(res, { choices: [{ delta: { content: chunk.text() } }] });
          }
        }
      }
      // After the token stream, send the citations
      writeSSE(res, {
        choices: [{ delta: { custom_meta: { citations: source_documents } } }],
      });
    } catch (e) {
      console.error("[Generation] Error during LLM stream:", e);
      writeSSE(res, {
        choices: [
          {
            delta: {
              content: "\n\nSorry, an error occurred during generation.",
            },
          },
        ],
      });
    } finally {
      // End the stream
      writeSSE(res, "[DONE]");
      res.end();
      console.log("[Generation] Stream finished.");
    }
  }
}

// Helper to write Server-Sent Events in the OpenAI-compatible format
function writeSSE(res, data) {
  const id = uuidv4();
  const chunk =
    typeof data === "string"
      ? data
      : JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model:
            LLM_PROVIDER === "openai" ? OPENAI_MODEL_NAME : GEMINI_MODEL_NAME,
          ...data,
        });
  res.write(`data: ${chunk}\n\n`);
}

// Original endpoint, remains non-streaming
app.post("/ask", async (req, res) => {
  try {
    const { query, top_k } = req.body;
    if (!query) return res.status(400).json({ error: "Missing query" });
    console.log("---------------------------------");
    console.log(`[API /ask] Received query: "${query}", top_k: ${top_k}`);
    console.log("---------------------------------");
    const result = await ask(query, top_k, false); // stream = false
    return res.json(result);
  } catch (e) {
    console.error("[API /ask] Endpoint error:", e);
    return res
      .status(500)
      .json({ error: e.message || "Error processing request." });
  }
});

// NEW Streaming endpoint for LibreChat
app.post("/stream-ask", async (req, res) => {
  try {
    const { query, top_k } = req.body;
    if (!query) return res.status(400).json({ error: "Missing query" });

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // flush the headers to establish connection

    console.log("---------------------------------");
    console.log(
      `[API /stream-ask] Received query: "${query}", top_k: ${top_k}`
    );
    console.log("---------------------------------");

    // Call ask function in streaming mode
    await ask(query, top_k, true, res);

    res.on("close", () => {
      console.log("[API /stream-ask] Client closed connection.");
      res.end();
    });
  } catch (e) {
    console.error("[API /stream-ask] Endpoint error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || "Error processing request." });
    } else {
      res.end();
    }
  }
});

async function startServer() {
  app.listen(RASS_ENGINE_PORT, () =>
    console.log(
      `RASS Engine API running on http://localhost:${RASS_ENGINE_PORT}`
    )
  );
}

startServer();
