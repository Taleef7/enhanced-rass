// mcp-server/src/config.js
// Centralized configuration loading and validation for the MCP server.
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
  "MCP_SERVER_PORT",
  "OPENSEARCH_HOST",
  "OPENSEARCH_PORT",
  "OPENSEARCH_INDEX_NAME",
  "RASS_ENGINE_PORT",
  "EMBEDDING_SERVICE_PORT",
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

const {
  MCP_SERVER_PORT,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  RASS_ENGINE_PORT,
  EMBEDDING_SERVICE_PORT,
} = rawConfig;

// Derive upstream service base URLs from config; env vars allow override for local dev.
const RASS_ENGINE_BASE_URL =
  process.env.RASS_ENGINE_URL ||
  `http://rass-engine-service:${RASS_ENGINE_PORT}`;

const EMBEDDING_SERVICE_BASE_URL =
  process.env.EMBEDDING_SERVICE_URL ||
  `http://embedding-service:${EMBEDDING_SERVICE_PORT}`;

console.log("[Config] Loaded and validated configuration from config.yml");

module.exports = {
  MCP_SERVER_PORT,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  RASS_ENGINE_PORT,
  EMBEDDING_SERVICE_PORT,
  RASS_ENGINE_BASE_URL,
  EMBEDDING_SERVICE_BASE_URL,
};
