// rass-engine-service/index.js
const { rerank } = require("./reranker.js");
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const app = express();
const { Client } = require("@opensearch-project/opensearch");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { planAndExecute } = require("./agenticPlanner");
const { runSteps } = require("./executePlan");

// Load all necessary .env variables
const {
  OPENAI_API_KEY,
  GEMINI_API_KEY,
  LLM_PLANNER_PROVIDER = "openai",
  OPENAI_PLANNER_MODEL_NAME = "gpt-4o",
  GEMINI_PLANNER_MODEL_NAME = "gemini-1.5-flash-latest",
  SEARCH_TERM_EMBEDDING_PROVIDER = "openai",
  OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS = "text-embedding-3-small",
  GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS = "embedding-001",
  OPENSEARCH_HOST = "localhost",
  OPENSEARCH_PORT = "9200",
  OPENSEARCH_INDEX_NAME = "knowledge_base",
  RASS_ENGINE_PORT = 8000,
  DEFAULT_K_OPENSEARCH_HITS = 25, // Increased default for wider candidate pool
} = process.env;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "RASS Engine is running" });
});

const EMBED_DIM =
  parseInt(process.env.EMBED_DIM, 10) ||
  (SEARCH_TERM_EMBEDDING_PROVIDER === "gemini" ? 768 : 1536);

let plannerLLMClient;
let searchEmbedderClient;

if (LLM_PLANNER_PROVIDER === "openai") {
  if (!OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required for OpenAI planner.");
  plannerLLMClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(
    `[Initialization] LLM Planner: OpenAI, Model: ${OPENAI_PLANNER_MODEL_NAME}`
  );
} else {
  if (!GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY is required for Gemini planner.");
  const googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  plannerLLMClient = googleGenAI.getGenerativeModel({
    model: GEMINI_PLANNER_MODEL_NAME,
  });
  console.log(
    `[Initialization] LLM Planner: Gemini, Model: ${GEMINI_PLANNER_MODEL_NAME}`
  );
}

if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
  if (!OPENAI_API_KEY)
    throw new Error(
      "OPENAI_API_KEY is required for OpenAI search term embedder."
    );
  searchEmbedderClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(
    `[Initialization] Search Term Embedder: OpenAI, Model: ${OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS}, Dim: ${EMBED_DIM}`
  );
} else {
  if (!GEMINI_API_KEY)
    throw new Error(
      "GEMINI_API_KEY is required for Gemini search term embedder."
    );
  const googleGenAI_Embed = new GoogleGenerativeAI(GEMINI_API_KEY);
  searchEmbedderClient = googleGenAI_Embed.getGenerativeModel({
    model: GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
  });
  console.log(
    `[Initialization] Search Term Embedder: Gemini, Model: ${GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS}, Dim: ${EMBED_DIM}`
  );
}

const osClient = new Client({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

async function embedText(text) {
  if (!text?.trim())
    throw new Error("Empty text provided for search term embedding");
  const targetDimension = Number(EMBED_DIM);
  console.log(
    `[EmbedSearchTerm] Provider: ${SEARCH_TERM_EMBEDDING_PROVIDER}, Term: "${text}"`
  );

  try {
    if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
      const { data } = await searchEmbedderClient.embeddings.create({
        model: OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS,
        input: text,
      });
      return data[0].embedding;
    } else {
      // Gemini
      const result = await searchEmbedderClient.embedContent({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
      });
      return result.embedding.values;
    }
  } catch (err) {
    console.error(
      `[EmbedSearchTerm] Error embedding "${text}" with ${SEARCH_TERM_EMBEDDING_PROVIDER}:`,
      err.message
    );
    throw err;
  }
}

async function ask(query, top_k_param) {
  if (!query?.trim()) throw new Error("Empty query");
  const top_k = top_k_param || 5; // We rerank all parents, then select top 5 for generation.

  console.log(
    `[Ask] Query: "${query}", Target Index: ${OPENSEARCH_INDEX_NAME}, Top K for generation: ${top_k}`
  );

  // planAndExecute now returns parent documents
  const parentDocs = await planAndExecute({
    query,
    llmClient: plannerLLMClient,
    llmProvider: LLM_PLANNER_PROVIDER,
    openaiPlannerModel: OPENAI_PLANNER_MODEL_NAME,
    osClient,
    indexName: OPENSEARCH_INDEX_NAME,
    embedTextFn: embedText,
    runStepsFn: runSteps,
  });

  if (!parentDocs || !parentDocs.length) {
    console.warn("[Ask] No parent documents found for the query.");
    return {
      answer:
        "I could not find any relevant information to answer your question.",
      source_documents: [],
    };
  }

  // The documents are now the full parent documents, ready for reranking.
  // The structure from runSteps is { _source: { text, metadata }, _score }
  const initial_documents = parentDocs
    .map((h) => ({
      text: h._source ? h._source.text : null,
      initial_score: h._score || 0,
      // Pass parent metadata through
      metadata: h._source ? h._source.metadata : {},
    }))
    .filter((doc) => typeof doc.text === "string" && doc.text.trim() !== "");

  const reranked_documents = await rerank(query, initial_documents);

  const source_documents = reranked_documents.slice(0, top_k);

  console.log(
    `[Generation] Generating final answer with ${source_documents.length} reranked parent documents...`
  );

  const context = source_documents.map((doc) => doc.text).join("\n\n---\n\n");

  const generationPrompt = `You are a helpful assistant. Answer the user's question based on the following context. 
- Only say "the context does not contain the answer" if there is truly no relevant information.
<context>
${context}
</context>
Question: ${query}
Answer:`;

  let answer = "Sorry, I was unable to generate an answer.";
  try {
    if (LLM_PLANNER_PROVIDER === "openai") {
      const completion = await plannerLLMClient.chat.completions.create({
        model: OPENAI_PLANNER_MODEL_NAME,
        messages: [{ role: "user", content: generationPrompt }],
      });
      answer = completion.choices[0].message.content;
    } else {
      // Gemini
      const result = await plannerLLMClient.generateContent(generationPrompt);
      answer = result.response.text();
    }
  } catch (e) {
    console.error("[Generation] Error calling LLM for final answer:", e);
  }

  console.log(`[Generation] Final answer generated.`);

  return {
    answer: answer,
    source_documents: source_documents, // These now contain full context
  };
}

app.post("/ask", async (req, res) => {
  try {
    const { query, top_k } = req.body;
    if (!query) return res.status(400).json({ error: "Missing query" });
    console.log("---------------------------------");
    console.log(`[API /ask] Received query: "${query}", top_k: ${top_k}`);
    console.log("---------------------------------");
    const result = await ask(query, top_k);
    return res.json(result);
  } catch (e) {
    console.error("[API /ask] Endpoint error:", e);
    return res
      .status(500)
      .json({ error: e.message || "Error processing request." });
  }
});

async function startServer() {
  const srv = app.listen(RASS_ENGINE_PORT, () =>
    console.log(
      `RASS Engine API running on http://localhost:${RASS_ENGINE_PORT}`
    )
  );
}

startServer();
