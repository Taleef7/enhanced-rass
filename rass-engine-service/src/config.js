// rass-engine-service/src/config.js
// Centralized configuration loading and validation for the RASS engine service.
// Throws a descriptive error on missing required fields before the server binds a port.

const yaml = require("js-yaml");
const fs = require("fs");

let rawConfig;
try {
  rawConfig = yaml.load(fs.readFileSync("./config.yml", "utf8"));
} catch (err) {
  throw new Error(`[Config] Failed to read or parse config.yml: ${err.message}`);
}

const REQUIRED_FIELDS = [
  "LLM_PROVIDER",
  "OPENAI_MODEL_NAME",
  "GEMINI_MODEL_NAME",
  "SEARCH_TERM_EMBEDDING_PROVIDER",
  "OPENAI_EMBED_MODEL_NAME",
  "GEMINI_EMBED_MODEL_NAME",
  "OPENSEARCH_HOST",
  "OPENSEARCH_PORT",
  "OPENSEARCH_INDEX_NAME",
  "RASS_ENGINE_PORT",
  "EMBEDDING_SERVICE_PORT",
  "DEFAULT_K_OPENSEARCH_HITS",
  "EMBED_DIM",
];

const missing = REQUIRED_FIELDS.filter(
  (field) => rawConfig[field] === undefined || rawConfig[field] === null
);
if (missing.length > 0) {
  throw new Error(
    `[Config] Missing required config field(s): ${missing.join(", ")}. ` +
      `Check your config.yml and ensure all required fields are present.`
  );
}

if (!rawConfig.search || rawConfig.search.DEFAULT_TOP_K === undefined) {
  throw new Error(
    `[Config] Missing required config field: search.DEFAULT_TOP_K`
  );
}

const ALLOWED_PROVIDERS = ["openai", "gemini"];
if (!ALLOWED_PROVIDERS.includes(rawConfig.LLM_PROVIDER)) {
  throw new Error(
    `[Config] Invalid LLM_PROVIDER "${rawConfig.LLM_PROVIDER}". ` +
      `Allowed values: ${ALLOWED_PROVIDERS.join(", ")}`
  );
}
if (!ALLOWED_PROVIDERS.includes(rawConfig.SEARCH_TERM_EMBEDDING_PROVIDER)) {
  throw new Error(
    `[Config] Invalid SEARCH_TERM_EMBEDDING_PROVIDER "${rawConfig.SEARCH_TERM_EMBEDDING_PROVIDER}". ` +
      `Allowed values: ${ALLOWED_PROVIDERS.join(", ")}`
  );
}

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
  EMBEDDING_SERVICE_PORT,
  DEFAULT_K_OPENSEARCH_HITS,
  EMBED_DIM,
  search: { DEFAULT_TOP_K },
} = rawConfig;

// Derive the embedding-service base URL from config; override via env var for local dev.
const EMBEDDING_SERVICE_BASE_URL =
  process.env.EMBEDDING_SERVICE_URL ||
  `http://embedding-service:${EMBEDDING_SERVICE_PORT}`;

console.log("[Config] Loaded and validated configuration from config.yml");

module.exports = {
  LLM_PROVIDER,
  OPENAI_MODEL_NAME,
  GEMINI_MODEL_NAME,
  SEARCH_TERM_EMBEDDING_PROVIDER,
  OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS,
  GEMINI_EMBED_MODEL_FOR_SEARCH_TERMS,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  RASS_ENGINE_PORT,
  EMBEDDING_SERVICE_PORT,
  EMBEDDING_SERVICE_BASE_URL,
  DEFAULT_K_OPENSEARCH_HITS,
  EMBED_DIM,
  DEFAULT_TOP_K,
};
