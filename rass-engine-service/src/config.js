// rass-engine-service/src/config.js
// Centralized configuration loading and validation for the RASS engine service.
// Uses Zod (ConfigSchema) to validate config.yml at startup; exits with a
// human-readable error message if any field is missing or invalid.

const yaml = require("js-yaml");
const fs = require("fs");
const { ConfigSchema } = require("./schemas/configSchema");

let rawConfig;
try {
  rawConfig = yaml.load(fs.readFileSync("./config.yml", "utf8"));
} catch (err) {
  throw new Error(`[Config] Failed to read or parse config.yml: ${err.message}`);
}

const result = ConfigSchema.safeParse(rawConfig);
if (!result.success) {
  const messages = result.error.issues
    .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`[Config] config.yml validation failed:\n${messages}`);
  process.exit(1);
}

const config = result.data;

// Derive the embedding-service base URL from config; override via env var for local dev.
const EMBEDDING_SERVICE_BASE_URL =
  process.env.EMBEDDING_SERVICE_URL ||
  `http://embedding-service:${config.EMBEDDING_SERVICE_PORT}`;

console.log("[Config] Loaded and validated configuration from config.yml");

module.exports = {
  LLM_PROVIDER: config.LLM_PROVIDER,
  OPENAI_MODEL_NAME: config.OPENAI_MODEL_NAME,
  GEMINI_MODEL_NAME: config.GEMINI_MODEL_NAME,
  SEARCH_TERM_EMBEDDING_PROVIDER: config.SEARCH_TERM_EMBEDDING_PROVIDER,
  OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS: config.OPENAI_EMBED_MODEL_NAME,
  GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS: config.GEMINI_EMBED_MODEL_NAME,
  OPENSEARCH_HOST: config.OPENSEARCH_HOST,
  OPENSEARCH_PORT: config.OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME: config.OPENSEARCH_INDEX_NAME,
  RASS_ENGINE_PORT: config.RASS_ENGINE_PORT,
  EMBEDDING_SERVICE_PORT: config.EMBEDDING_SERVICE_PORT,
  EMBEDDING_SERVICE_BASE_URL,
  DEFAULT_K_OPENSEARCH_HITS: config.DEFAULT_K_OPENSEARCH_HITS,
  EMBED_DIM: config.EMBED_DIM,
  DEFAULT_TOP_K: config.search.DEFAULT_TOP_K,
  // Phase C: Reranking
  RERANK_PROVIDER: config.RERANK_PROVIDER,
  RERANK_TOP_N: config.RERANK_TOP_N,
  COHERE_RERANK_MODEL: config.COHERE_RERANK_MODEL,
  RERANKER_PORT: config.RERANKER_PORT,
  // Phase C: HyDE
  HYDE_ENABLED: config.HYDE_ENABLED,
  HYDE_MAX_TOKENS: config.HYDE_MAX_TOKENS,
  // Phase G #135: Ollama local model support
  OLLAMA_BASE_URL: config.OLLAMA_BASE_URL,
  OLLAMA_LLM_MODEL: config.OLLAMA_LLM_MODEL,
  OLLAMA_EMBED_MODEL: config.OLLAMA_EMBED_MODEL,
  // Phase G #134: Adaptive retrieval feedback
  FEEDBACK_BOOST_ENABLED: config.FEEDBACK_BOOST_ENABLED,
  // Phase G #136: Vision/multi-modal
  VISION_ENABLED: config.VISION_ENABLED,
  // LLM generation limit
  LLM_MAX_TOKENS: config.LLM_MAX_TOKENS,
  // Phase 2: Conversational query reformulation
  QUERY_REFORMULATION_ENABLED: config.QUERY_REFORMULATION_ENABLED,
  // Phase 3: Contextual retrieval
  CONTEXTUAL_RETRIEVAL_ENABLED: config.CONTEXTUAL_RETRIEVAL_ENABLED,
  CONTEXTUAL_RETRIEVAL_PROVIDER: config.CONTEXTUAL_RETRIEVAL_PROVIDER,
  // Phase 6: LightRAG graph layer
  GRAPH_EXTRACTION_ENABLED: config.GRAPH_EXTRACTION_ENABLED,
  GRAPH_EXPANSION_ENABLED: config.GRAPH_EXPANSION_ENABLED,
  // Phase 7: Web search fallback
  WEB_SEARCH_ENABLED: config.WEB_SEARCH_ENABLED,
  WEB_SEARCH_PROVIDER: config.WEB_SEARCH_PROVIDER,
  WEB_SEARCH_THRESHOLD: config.WEB_SEARCH_THRESHOLD,
};
