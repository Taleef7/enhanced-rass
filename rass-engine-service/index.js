// rass-engine-service/index.js
const express = require("express");
const { Client } = require("@opensearch-project/opensearch");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const yaml = require("js-yaml");
const { v4: uuidv4 } = require("uuid"); // Import uuid
const { runSteps, simpleSearch } = require("./executePlan");
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
  search: { DEFAULT_TOP_K },
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

// --- START: NEW CONTEXT-AWARE SEARCH PLANNER ---
async function createRefinedSearchPlan(
  llmClient,
  llmProvider,
  modelName,
  originalQuery,
  initialContext
) {
  console.log(
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
    let searchTerms = [];
    if (llmProvider === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: modelName,
        messages: [{ role: "user", content: planningPrompt }],
        temperature: 0.5,
      });
      searchTerms = JSON.parse(completion.choices[0].message.content);
    } else {
      const result = await llmClient.generateContent(planningPrompt);
      const response = result.response.text();
      searchTerms = JSON.parse(response);
    }

    const plan = searchTerms.map((term, index) => ({
      step_id: `refined_search_${index + 1}`,
      search_term: term.trim(),
      knn_k: DEFAULT_K_OPENSEARCH_HITS,
    }));

    console.log(`[Refined Plan] Created ${plan.length} new search steps.`);
    return plan;
  } catch (error) {
    console.warn(
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
// --- END: NEW CONTEXT-AWARE SEARCH PLANNER ---

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

// REFACTORED 'ask' function to support both streaming and non-streaming
async function ask(
  query,
  top_k_param,
  stream = false,
  res = null,
  userId,
  documents
) {
  if (!query?.trim()) throw new Error("Empty query");
  // if the API caller passed in `top_k_param`, use that; otherwise fall back to our config
  const top_k_for_generation =
    typeof top_k_param === "number" ? top_k_param : DEFAULT_TOP_K;
  console.log(`[Ask] Query: "${query}", User: ${userId}`);

  console.log("[Retrieval Stage 1] Performing initial broad search...");
  const initialHits = await simpleSearch({
    term: query,
    embed: embedText,
    os: osClient,
    index: OPENSEARCH_INDEX_NAME,
    userId,
    documents,
  });

  if (!initialHits || initialHits.length === 0) {
    console.warn("[Ask] No documents found in initial search.");
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
    }
    return emptyResponse;
  }

  const initialContext = initialHits
    .map((hit) => hit._source.text)
    .join("\n\n---\n\n");

  // Stage 2: Context-aware search refinement
  console.log(
    "[Retrieval Stage 2] Skipping refined search - using initial hits"
  );
  const finalParentDocs = initialHits;

  const parentDocsToUse =
    finalParentDocs && finalParentDocs.length > 0
      ? finalParentDocs
      : initialHits.map((h) => ({ _source: h._source, _score: h._score }));

  const source_documents = parentDocsToUse
    .map((h) => ({
      text: h._source?.text,
      metadata: h._source?.metadata,
      initial_score: h._score,
    }))
    .filter((doc) => doc.text?.trim())
    .slice(0, top_k_for_generation);

  console.log(
    `[Generation] Generating with ${source_documents.length} documents...`
  );

  const context = source_documents.map((doc) => doc.text).join("\n\n---\n\n");
  const generationPrompt = `
You are a knowledgeable assistant whose sole job is to answer the user's question by **only** using the information given in the Context. Do **not** hallucinate or bring in outside knowledge.

Guidelines:
1. Provide a concise, accurate answer in ideally 2–3 paragraphs or as per the users' request.
2. If the Context does not contain enough information to answer, reply exactly: "I don’t have enough information to answer that question."
3. If the Context contains information that is not relevant to the question, do not include it in your answer.
4. If the Context contains multiple documents, synthesize the information into a coherent answer.
5. If the question is about a specific document, focus on that document's content.
6. If the question is about a general topic, use the most relevant documents to provide a comprehensive answer.
7. If the question is about a specific event or fact, ensure your answer is directly supported by the Context.


Context:
${context}

Question:
${query}

Answer:
`.trim();

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
  console.log(
    "[RASS->SSE]",
    typeof data === "string"
      ? data
      : JSON.stringify(data).substring(0, 100) + "..."
  );
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
    const { query, documents, userId, top_k } = req.body;
    if (!query || !userId) {
      return res.status(400).json({ error: "Missing query or userId" });
    }

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // flush the headers to establish connection

    console.log("---------------------------------");
    console.log(
      `[API /stream-ask] Received query: "${query}", top_k: ${top_k}`
    );
    console.log(`[API /stream-ask] Received query from user: ${userId}`);
    console.log("---------------------------------");

    // Call ask function in streaming mode
    await ask(query, top_k, true, res, userId, documents);

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
