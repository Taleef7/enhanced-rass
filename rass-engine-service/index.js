// rass-engine-service/index.js
const { rerank } = require("./reranker.js");
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const app = express();
const { Client } = require("@opensearch-project/opensearch");
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { runSteps } = require("./executePlan");
const { generateHypotheticalDocument } = require("./hydeGenerator.js");

// Load all necessary .env variables
const {
  OPENAI_API_KEY,
  GEMINI_API_KEY,
  LLM_PROVIDER = "openai", // Used for both HyDE and Final Answer Generation
  OPENAI_MODEL_NAME = "gpt-4o-mini",
  GEMINI_MODEL_NAME = "gemini-1.5-flash-latest",
  SEARCH_TERM_EMBEDDING_PROVIDER = "gemini",
  OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS = "text-embedding-3-small",
  GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS = "text-embedding-004",
  OPENSEARCH_HOST = "localhost",
  OPENSEARCH_PORT = "9200",
  OPENSEARCH_INDEX_NAME = "knowledge_base",
  RASS_ENGINE_PORT = 8000,
  // This K is for the initial candidate pool for the reranker. Should be larger.
  DEFAULT_K_OPENSEARCH_HITS = 50,
} = process.env;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "RASS Engine is running" });
});

const EMBED_DIM =
  parseInt(process.env.EMBED_DIM, 10) ||
  (SEARCH_TERM_EMBEDDING_PROVIDER === "gemini" ? 768 : 1536);

let llmClient; // Single client for both HyDE and final answer
let searchEmbedderClient;

if (LLM_PROVIDER === "openai") {
  if (!OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required for OpenAI provider.");
  llmClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(
    `[Initialization] LLM Provider: OpenAI, Model: ${OPENAI_MODEL_NAME}`
  );
} else {
  // Gemini
  if (!GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY is required for Gemini provider.");
  const googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  llmClient = googleGenAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  console.log(
    `[Initialization] LLM Provider: Gemini, Model: ${GEMINI_MODEL_NAME}`
  );
}

if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
  if (!OPENAI_API_KEY)
    throw new Error(
      "OPENAI_API_KEY is required for OpenAI search term embedder."
    );
  searchEmbedderClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(
    `[Initialization] Search Term Embedder: OpenAI, Model: ${OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS}`
  );
} else {
  // Gemini
  if (!GEMINI_API_KEY)
    throw new Error(
      "GEMINI_API_KEY is required for Gemini search term embedder."
    );
  const googleGenAI_Embed = new GoogleGenerativeAI(GEMINI_API_KEY);
  searchEmbedderClient = googleGenAI_Embed.getGenerativeModel({
    model: GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
  });
  console.log(
    `[Initialization] Search Term Embedder: Gemini, Model: ${GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS}`
  );
}

const osClient = new Client({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

async function embedText(text) {
  if (!text?.trim())
    throw new Error("Empty text provided for search term embedding");
  console.log(`[EmbedSearchTerm] Embedding text for search...`);

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
      `[EmbedSearchTerm] Error embedding text with ${SEARCH_TERM_EMBEDDING_PROVIDER}:`,
      err.message
    );
    throw err;
  }
}

async function ask(query, top_k_param) {
  if (!query?.trim()) throw new Error("Empty query");
  const top_k_for_generation = top_k_param || 5;

  console.log(`[Ask] Query: "${query}"`);

  // --- NEW HyDE FLOW ---
  // 1. Generate hypothetical document
  const hypotheticalDocument = await generateHypotheticalDocument(
    llmClient,
    LLM_PROVIDER,
    LLM_PROVIDER === "openai" ? OPENAI_MODEL_NAME : GEMINI_MODEL_NAME,
    query
  );

  // 2. Create a simple, single-step plan using the HyDE result.
  const simplePlan = [
    {
      step_id: "hyde_search",
      search_term: hypotheticalDocument,
      knn_k: DEFAULT_K_OPENSEARCH_HITS,
    },
  ];

  // 3. Execute the search to retrieve parent documents
  const parentDocs = await runSteps({
    plan: simplePlan,
    embed: embedText,
    os: osClient,
    index: OPENSEARCH_INDEX_NAME,
  });

  if (!parentDocs || !parentDocs.length) {
    console.warn("[Ask] No parent documents found after HyDE search.");
    return {
      answer:
        "I could not find any relevant information to answer your question.",
      source_documents: [],
    };
  }

  const initial_documents = parentDocs
    .map((h) => ({
      text: h._source ? h._source.text : null,
      metadata: h._source ? h._source.metadata : {},
    }))
    .filter((doc) => typeof doc.text === "string" && doc.text.trim() !== "");

  const reranked_documents = await rerank(query, initial_documents);

  const source_documents = reranked_documents.slice(0, top_k_for_generation);

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
    if (LLM_PROVIDER === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: OPENAI_MODEL_NAME,
        messages: [{ role: "user", content: generationPrompt }],
      });
      answer = completion.choices[0].message.content;
    } else {
      // Gemini
      const result = await llmClient.generateContent(generationPrompt);
      answer = result.response.text();
    }
  } catch (e) {
    console.error("[Generation] Error calling LLM for final answer:", e);
  }

  console.log(`[Generation] Final answer generated.`);

  return {
    answer: answer,
    source_documents: source_documents,
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
  app.listen(RASS_ENGINE_PORT, () =>
    console.log(
      `RASS Engine API running on http://localhost:${RASS_ENGINE_PORT}`
    )
  );
}

startServer();
