// embedding-service/src/config.js
// Centralized configuration loading and validation for the embedding service.
// Uses Zod (ConfigSchema) to validate config.yml at startup; exits with a
// human-readable error message if any field is missing or invalid.

const yaml = require("js-yaml");
const fs = require("fs-extra");
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

console.log("[Config] Loaded and validated configuration from config.yml");

module.exports = {
  EMBEDDING_PROVIDER: config.EMBEDDING_PROVIDER,
  CHUNKING_STRATEGY: config.CHUNKING_STRATEGY,
  OPENSEARCH_HOST: config.OPENSEARCH_HOST,
  OPENSEARCH_PORT: config.OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME: config.OPENSEARCH_INDEX_NAME,
  EMBEDDING_SERVICE_PORT: config.EMBEDDING_SERVICE_PORT,
  PARENT_CHUNK_SIZE: config.PARENT_CHUNK_SIZE,
  PARENT_CHUNK_OVERLAP: config.PARENT_CHUNK_OVERLAP,
  CHILD_CHUNK_SIZE: config.CHILD_CHUNK_SIZE,
  CHILD_CHUNK_OVERLAP: config.CHILD_CHUNK_OVERLAP,
  EMBED_DIM: config.EMBED_DIM,
  OPENAI_EMBED_MODEL_NAME: config.OPENAI_EMBED_MODEL_NAME,
  GEMINI_EMBED_MODEL_NAME: config.GEMINI_EMBED_MODEL_NAME,
  REDIS_HOST: config.REDIS_HOST,
  REDIS_PORT: config.REDIS_PORT,
  REDIS_DB: config.REDIS_DB,
  // Phase G #135: Ollama
  OLLAMA_BASE_URL: config.OLLAMA_BASE_URL,
  OLLAMA_EMBED_MODEL: config.OLLAMA_EMBED_MODEL,
  // Phase G #136: Vision
  VISION_ENABLED: config.VISION_ENABLED,
  VISION_LLM_PROVIDER: config.VISION_LLM_PROVIDER,
  VISION_LLM_MODEL: config.VISION_LLM_MODEL,
};

