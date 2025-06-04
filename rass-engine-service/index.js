// rass-engine-service/index.js
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const app = express();
const { WebSocketServer } = require("ws");
const { Client } = require("@opensearch-project/opensearch");
const { OpenAI } = require("openai"); // Keep OpenAI for its client
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Add Gemini

const { planAndExecute } = require("./agenticPlanner");
const { runSteps } = require("./executePlan");

// Load all necessary .env variables
const {
  OPENAI_API_KEY,
  // OPENAI_API_URL = 'https://api.openai.com/v1', // baseURL often not needed for OpenAI v4+
  GEMINI_API_KEY,

  LLM_PLANNER_PROVIDER = "openai",
  OPENAI_PLANNER_MODEL_NAME = "gpt-4o",
  GEMINI_PLANNER_MODEL_NAME = "gemini-1.5-flash-latest",

  SEARCH_TERM_EMBEDDING_PROVIDER = "openai",
  OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS = "text-embedding-3-small",
  GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS = "embedding-001", // (text-embedding-004)

  OPENSEARCH_HOST = "localhost",
  OPENSEARCH_PORT = "9200",
  OPENSEARCH_INDEX_NAME = "knowledge_base_gemini", // Defaulting to your Gemini index

  RASS_ENGINE_PORT = 8000,
  DEFAULT_K_OPENSEARCH_HITS = 10, // Used as fallback for knn_k
} = process.env;

app.use(express.json());

// EMBED_DIM is crucial and must match the target index AND the search term embedding model
const EMBED_DIM =
  parseInt(process.env.EMBED_DIM, 10) ||
  (SEARCH_TERM_EMBEDDING_PROVIDER === "gemini" ? 768 : 1536);

// ---- Initialize LLM and Embedding Clients ----
let plannerLLMClient; // This will be passed to agenticPlanner
let searchEmbedderClient; // This will be used by the local embedText function

// Initialize Planner LLM Client
if (LLM_PLANNER_PROVIDER === "openai") {
  if (!OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required for OpenAI planner.");
  plannerLLMClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(
    `[Initialization] LLM Planner: OpenAI, Model: ${OPENAI_PLANNER_MODEL_NAME}`
  );
} else if (LLM_PLANNER_PROVIDER === "gemini") {
  if (!GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY is required for Gemini planner.");
  const googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  plannerLLMClient = googleGenAI.getGenerativeModel({
    model: GEMINI_PLANNER_MODEL_NAME,
  });
  console.log(
    `[Initialization] LLM Planner: Gemini, Model: ${GEMINI_PLANNER_MODEL_NAME}`
  );
} else {
  throw new Error(`Unsupported LLM_PLANNER_PROVIDER: ${LLM_PLANNER_PROVIDER}`);
}

// Initialize Client for Search Term Embeddings (used by local embedText function)
if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
  if (!OPENAI_API_KEY)
    throw new Error(
      "OPENAI_API_KEY is required for OpenAI search term embedder."
    );
  // Can reuse the planner's OpenAI client if keys are the same, or make a new one
  searchEmbedderClient = new OpenAI({ apiKey: OPENAI_API_KEY }); // Assuming same API key for simplicity
  console.log(
    `[Initialization] Search Term Embedder: OpenAI, Model: ${OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS}, Dim: ${EMBED_DIM}`
  );
  if (
    (EMBED_DIM !== 1536 &&
      OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS.includes("ada")) ||
    OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS.includes("text-embedding-3-small")
  )
    console.warn("EMBED_DIM mismatch for OpenAI search term embedding model!");
  if (
    EMBED_DIM !== 3072 &&
    OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS.includes("text-embedding-3-large")
  )
    console.warn("EMBED_DIM mismatch for OpenAI search term embedding model!");
} else if (SEARCH_TERM_EMBEDDING_PROVIDER === "gemini") {
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
  if (
    EMBED_DIM !== 768 &&
    GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS === "embedding-001"
  )
    console.warn(
      "EMBED_DIM mismatch for Gemini search term embedding model (embedding-001 is 768d)!"
    );
  if (
    EMBED_DIM !== 3072 &&
    GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS === "gemini-embedding-001"
  )
    console.warn(
      "EMBED_DIM mismatch for Gemini search term embedding model (gemini-embedding-001 is 3072d)!"
    );
} else {
  throw new Error(
    `Unsupported SEARCH_TERM_EMBEDDING_PROVIDER: ${SEARCH_TERM_EMBEDDING_PROVIDER}`
  );
}

const osClient = new Client({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
  // ssl: { rejectUnauthorized: false } // Only if using self-signed certs on OS, generally not recommended for prod
});

app.use(express.json());

/**
 * Ensures the OpenSearch index (specified by OPENSEARCH_INDEX_NAME) exists.
 * Note: This service *queries* the index. Index creation/mapping is primarily
 * the responsibility of the embedding-service. This function is more of a check.
 */
async function checkIndexExists() {
  try {
    const exists = await osClient.indices.exists({
      index: OPENSEARCH_INDEX_NAME,
    });
    if (!exists.body) {
      console.error(
        `[OpenSearch Check] CRITICAL: Index '${OPENSEARCH_INDEX_NAME}' does NOT exist. This service cannot query it. Ensure embedding-service has created and populated it.`
      );
      // Unlike embedding-service, rass-engine might not create the index,
      // as its schema (esp. EMBED_DIM) is dictated by what embedding-service created.
      // For now, we'll just log an error.
      // throw new Error(`Index ${OPENSEARCH_INDEX_NAME} not found.`);
    } else {
      console.log(
        `[OpenSearch Check] Index '${OPENSEARCH_INDEX_NAME}' exists and is queryable.`
      );
      // You could optionally fetch and log/verify mapping dimension here if needed.
    }
  } catch (err) {
    console.error(
      `[OpenSearch Check] Error checking index '${OPENSEARCH_INDEX_NAME}':`,
      err.message
    );
    // throw err; // Or handle gracefully
  }
}

// MODIFIED: Generates embeddings for search terms based on configured provider
async function embedText(text) {
  if (!text?.trim())
    throw new Error("Empty text provided for search term embedding");

  // Ensure EMBED_DIM is a number for comparison and API calls
  const targetDimension = Number(EMBED_DIM);

  console.log(
    `[EmbedSearchTerm] Provider: ${SEARCH_TERM_EMBEDDING_PROVIDER}, Term: "${text}"`
  );

  try {
    if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
      const { data } = await searchEmbedderClient.embeddings.create({
        model: OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS,
        input: text, // OpenAI embedding API takes string directly
      });
      const embedding = data[0].embedding;
      if (embedding.length !== targetDimension) {
        throw new Error(
          `OpenAI embedding dimension mismatch for "${text}". Expected ${targetDimension}, got ${embedding.length}`
        );
      }
      return embedding;
    } else if (SEARCH_TERM_EMBEDDING_PROVIDER === "gemini") {
      const taskType = "RETRIEVAL_QUERY"; // For embedding user queries to find relevant documents
      const embedConfig = { taskType };
      // For gemini-embedding-001 and similar, outputDimensionality can be set if < model's max
      if (
        GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS === "gemini-embedding-001" &&
        targetDimension < 3072
      ) {
        embedConfig.outputDimensionality = targetDimension;
      }
      // For "embedding-001" (text-embedding-004), output dimension is fixed at 768, so no need to set outputDimensionality if targetDimension is 768.

      const result = await searchEmbedderClient.embedContent({
        content: { parts: [{ text }] },
        ...embedConfig,
      });
      const embedding = result.embedding.values;
      if (embedding.length !== targetDimension) {
        throw new Error(
          `Gemini embedding dimension mismatch for "${text}". Expected ${targetDimension}, got ${embedding.length}`
        );
      }
      return embedding;
    } else {
      throw new Error(
        `Unsupported SEARCH_TERM_EMBEDDING_PROVIDER: ${SEARCH_TERM_EMBEDDING_PROVIDER}`
      );
    }
  } catch (err) {
    console.error(
      `[EmbedSearchTerm] Error embedding "${text}" with ${SEARCH_TERM_EMBEDDING_PROVIDER}:`,
      err.message
    );
    throw err; // Re-throw to be caught by the caller
  }
}

// Main query function
async function ask(query, top_k_param) {
  if (!query?.trim()) throw new Error("Empty query");
  const top_k = top_k_param || Number(DEFAULT_K_OPENSEARCH_HITS);

  console.log(
    `[Ask] Query: "${query}", Target Index: ${OPENSEARCH_INDEX_NAME}, Top K: ${top_k}`
  );

  // The planAndExecute function will now receive the configured plannerLLMClient
  const hits = await planAndExecute({
    query,
    llmClient: plannerLLMClient, // Pass the initialized planner client
    llmProvider: LLM_PLANNER_PROVIDER, // Pass provider name for internal logic in agenticPlanner
    openaiPlannerModel: OPENAI_PLANNER_MODEL_NAME, // Pass specific model names
    geminiPlannerModel: GEMINI_PLANNER_MODEL_NAME,
    osClient,
    indexName: OPENSEARCH_INDEX_NAME,
    // mappings: null, // Mappings check can be done at startup or if needed
    embedTextFn: embedText, // Pass the ref to our new provider-aware embedText
    runStepsFn: runSteps,
  });

  if (!hits || !hits.length) {
    // Return empty docs array instead of throwing, or as per desired API contract
    console.warn("[Ask] No matching documents found for the query.");
    return { documents: [] };
  }

  const documents = hits.map((h) => ({
    doc_id: h._source?.doc_id,
    file_path: h._source?.file_path,
    file_type: h._source?.file_type,
    text_chunk: h._source?.text_chunk, // Make sure to include text_chunk if UI needs it
    score: h._score || 0,
  }));

  console.log(`[Ask] Returning ${documents.slice(0, top_k).length} documents.`);
  return { documents: documents.slice(0, top_k) };
}

// API endpoints
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

// WebSocket (no changes needed to its core logic for now)
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
  ws.on("message", async (msg) => {
    try {
      const { query, top_k } = JSON.parse(msg);
      if (!query) throw new Error("Missing query from WebSocket");
      console.log(`[WS /ask] Received query: "${query}", top_k: ${top_k}`);
      ws.send(JSON.stringify(await ask(query, top_k)));
    } catch (e) {
      console.error("[WS /ask] WebSocket error:", e);
      ws.send(JSON.stringify({ error: e.message }));
    } finally {
      // Consider if closing immediately is always desired
      // ws.close();
    }
  });
  ws.on("close", () => console.log("[WS /ask] Client disconnected"));
  ws.on("error", (err) =>
    console.error("[WS /ask] WebSocket error event:", err)
  );
});

async function startServer() {
  try {
    await checkIndexExists(); // Check if target index exists on startup
    const srv = app.listen(RASS_ENGINE_PORT, () =>
      console.log(
        `RASS Engine API running on http://localhost:${RASS_ENGINE_PORT}`
      )
    );
    srv.on("upgrade", (req, sock, head) => {
      if (req.url === "/ws/ask") {
        wss.handleUpgrade(req, sock, head, (ws) =>
          wss.emit("connection", ws, req)
        );
      } else {
        sock.destroy();
      }
    });
  } catch (e) {
    console.error("[Startup] Failed to start RASS Engine server:", e);
    process.exit(1);
  }
}

startServer();

process.on("SIGTERM", () => {
  console.log("[Shutdown] RASS Engine shutting down…");
  process.exit(0);
});
