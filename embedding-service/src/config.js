// embedding-service/src/config.js
// Centralized configuration loading and validation for the embedding service.
// Throws a descriptive error on missing required fields before the server binds a port.

const yaml = require("js-yaml");
const fs = require("fs-extra");

let rawConfig;
try {
  rawConfig = yaml.load(fs.readFileSync("./config.yml", "utf8"));
} catch (err) {
  throw new Error(`[Config] Failed to read or parse config.yml: ${err.message}`);
}

const REQUIRED_FIELDS = [
  "EMBEDDING_PROVIDER",
  "OPENSEARCH_HOST",
  "OPENSEARCH_PORT",
  "OPENSEARCH_INDEX_NAME",
  "EMBEDDING_SERVICE_PORT",
  "PARENT_CHUNK_SIZE",
  "PARENT_CHUNK_OVERLAP",
  "CHILD_CHUNK_SIZE",
  "CHILD_CHUNK_OVERLAP",
  "EMBED_DIM",
  "OPENAI_EMBED_MODEL_NAME",
  "GEMINI_EMBED_MODEL_NAME",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_DB",
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

const ALLOWED_PROVIDERS = ["openai", "gemini"];
if (!ALLOWED_PROVIDERS.includes(rawConfig.EMBEDDING_PROVIDER)) {
  throw new Error(
    `[Config] Invalid EMBEDDING_PROVIDER "${rawConfig.EMBEDDING_PROVIDER}". ` +
      `Allowed values: ${ALLOWED_PROVIDERS.join(", ")}`
  );
}

const {
  EMBEDDING_PROVIDER,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  EMBEDDING_SERVICE_PORT,
  PARENT_CHUNK_SIZE,
  PARENT_CHUNK_OVERLAP,
  CHILD_CHUNK_SIZE,
  CHILD_CHUNK_OVERLAP,
  EMBED_DIM,
  OPENAI_EMBED_MODEL_NAME,
  GEMINI_EMBED_MODEL_NAME,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_DB,
} = rawConfig;

console.log("[Config] Loaded and validated configuration from config.yml");

module.exports = {
  EMBEDDING_PROVIDER,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  EMBEDDING_SERVICE_PORT,
  PARENT_CHUNK_SIZE,
  PARENT_CHUNK_OVERLAP,
  CHILD_CHUNK_SIZE,
  CHILD_CHUNK_OVERLAP,
  EMBED_DIM,
  OPENAI_EMBED_MODEL_NAME,
  GEMINI_EMBED_MODEL_NAME,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_DB,
};
