// rass-engine-service/src/clients/embedder.js
// Search-term embedding client — embeds a query string for KNN retrieval.

const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  SEARCH_TERM_EMBEDDING_PROVIDER,
  OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS,
  GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
} = require("../config");

const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;

let searchEmbedderClient;

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

/**
 * Embeds a text string for use in KNN retrieval.
 *
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>} The embedding vector.
 */
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

module.exports = { embedText };
