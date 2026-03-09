const fs = require("fs-extra");
const yaml = require("js-yaml");

function loadConfig() {
  const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
  console.log("[Config] Loaded configuration from config.yml");

  const {
    OPENAI_API_KEY,
    GEMINI_API_KEY,
  } = process.env;

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
  } = config;

  return {
    envKeys: { OPENAI_API_KEY, GEMINI_API_KEY },
    embedding: {
      provider: EMBEDDING_PROVIDER,
      openaiModel: OPENAI_EMBED_MODEL_NAME,
      geminiModel: GEMINI_EMBED_MODEL_NAME,
    },
    opensearch: {
      host: OPENSEARCH_HOST,
      port: OPENSEARCH_PORT,
      indexName: OPENSEARCH_INDEX_NAME,
      embedDim: EMBED_DIM,
    },
    service: {
      port: EMBEDDING_SERVICE_PORT,
    },
    chunking: {
      parentSize: PARENT_CHUNK_SIZE,
      parentOverlap: PARENT_CHUNK_OVERLAP,
      childSize: CHILD_CHUNK_SIZE,
      childOverlap: CHILD_CHUNK_OVERLAP,
    },
    redis: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      db: REDIS_DB,
    },
  };
}

module.exports = { loadConfig };
