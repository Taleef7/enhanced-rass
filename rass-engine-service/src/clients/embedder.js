// rass-engine-service/src/clients/embedder.js
// Search-term embedding client — embeds a query string for KNN retrieval.

const { OpenAI } = require("openai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const logger = require("../logger");
const {
  SEARCH_TERM_EMBEDDING_PROVIDER,
  OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS,
  GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
  OLLAMA_BASE_URL,
  OLLAMA_EMBED_MODEL,
} = require("../config");

const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;

let searchEmbedderClient;

if (SEARCH_TERM_EMBEDDING_PROVIDER === "openai") {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required when SEARCH_TERM_EMBEDDING_PROVIDER is 'openai'."
    );
  }
  searchEmbedderClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  logger.info(
    `[Init] Search Embedder: OpenAI, Model: ${OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS}`
  );
} else if (SEARCH_TERM_EMBEDDING_PROVIDER === "gemini") {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is required when SEARCH_TERM_EMBEDDING_PROVIDER is 'gemini'."
    );
  }
  searchEmbedderClient = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
    taskType: "RETRIEVAL_QUERY",
  });
  logger.info(
    `[Init] Search Embedder: Gemini, Model: ${GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS}`
  );
} else {
  const baseURL = `${OLLAMA_BASE_URL || "http://ollama:11434"}/v1`;
  searchEmbedderClient = new OpenAI({
    baseURL,
    apiKey: "ollama",
  });
  logger.info(
    `[Init] Search Embedder: Ollama, Model: ${OLLAMA_EMBED_MODEL || "nomic-embed-text"}, BaseURL: ${baseURL}`
  );
}

/**
 * Embeds a text string for use in KNN retrieval.
 *
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>} The embedding vector.
 */
async function embedText(text) {
  if (!text?.trim()) throw new Error("Empty text provided for embedding");
  logger.info(`[EmbedSearchTerm] Embedding text...`);
  try {
    if (
      SEARCH_TERM_EMBEDDING_PROVIDER === "openai" ||
      SEARCH_TERM_EMBEDDING_PROVIDER === "ollama"
    ) {
      const { data } = await searchEmbedderClient.embeddings.create({
        model:
          SEARCH_TERM_EMBEDDING_PROVIDER === "openai"
            ? OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS
            : OLLAMA_EMBED_MODEL || "nomic-embed-text",
        input: text,
      });
      return data[0].embedding;
    } else {
      return await searchEmbedderClient.embedQuery(text);
    }
  } catch (err) {
    logger.error(
      `[EmbedSearchTerm] Error with ${SEARCH_TERM_EMBEDDING_PROVIDER}:`,
      err.message
    );
    throw err;
  }
}

module.exports = { embedText };
