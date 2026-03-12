// embedding-service/src/clients/embedder.js
// Embedding provider factory — returns an initialized embeddings client
// for OpenAI, Gemini, or Ollama (Phase G) based on config.

const { OpenAIEmbeddings } = require("@langchain/openai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { createOllamaEmbeddings } = require("../providers/OllamaEmbeddingProvider");
const logger = require("../logger");
const {
  EMBEDDING_PROVIDER,
  OPENAI_EMBED_MODEL_NAME,
  GEMINI_EMBED_MODEL_NAME,
  OLLAMA_BASE_URL,
  OLLAMA_EMBED_MODEL,
} = require("../config");

const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;

let embeddings;
let EMBEDDING_MODEL_NAME;

if (EMBEDDING_PROVIDER === "gemini") {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");
  EMBEDDING_MODEL_NAME = GEMINI_EMBED_MODEL_NAME;
  embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: GEMINI_EMBED_MODEL_NAME,
    taskType: "RETRIEVAL_DOCUMENT",
  });
  logger.info(
    `[Init] Embedding Provider: Gemini, Model: ${GEMINI_EMBED_MODEL_NAME}`
  );
} else if (EMBEDDING_PROVIDER === "ollama") {
  // Phase G #135: Ollama local model support
  const model = OLLAMA_EMBED_MODEL || "nomic-embed-text";
  EMBEDDING_MODEL_NAME = model;
  embeddings = createOllamaEmbeddings({ ollamaBaseUrl: OLLAMA_BASE_URL, modelName: model });
  logger.info(`[Init] Embedding Provider: Ollama, Model: ${model}, BaseURL: ${OLLAMA_BASE_URL || "http://ollama:11434"}`);
} else {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  EMBEDDING_MODEL_NAME = OPENAI_EMBED_MODEL_NAME;
  embeddings = new OpenAIEmbeddings({
    apiKey: OPENAI_API_KEY,
    model: OPENAI_EMBED_MODEL_NAME,
  });
  logger.info(
    `[Init] Embedding Provider: OpenAI, Model: ${OPENAI_EMBED_MODEL_NAME}`
  );
}

module.exports = { embeddings, EMBEDDING_MODEL_NAME };
