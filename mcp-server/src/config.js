// mcp-server/src/config.js
// Centralized configuration loading and validation for the MCP server.
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

// Derive upstream service base URLs from config; env vars allow override for local dev.
const RASS_ENGINE_BASE_URL =
  process.env.RASS_ENGINE_URL ||
  `http://rass-engine-service:${config.RASS_ENGINE_PORT}`;

const EMBEDDING_SERVICE_BASE_URL =
  process.env.EMBEDDING_SERVICE_URL ||
  `http://embedding-service:${config.EMBEDDING_SERVICE_PORT}`;

console.log("[Config] Loaded and validated configuration from config.yml");

module.exports = {
  MCP_SERVER_PORT: config.MCP_SERVER_PORT,
  OPENSEARCH_HOST: config.OPENSEARCH_HOST,
  OPENSEARCH_PORT: config.OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME: config.OPENSEARCH_INDEX_NAME,
  RASS_ENGINE_PORT: config.RASS_ENGINE_PORT,
  EMBEDDING_SERVICE_PORT: config.EMBEDDING_SERVICE_PORT,
  RASS_ENGINE_BASE_URL,
  EMBEDDING_SERVICE_BASE_URL,
};
