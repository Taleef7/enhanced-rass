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
} = rawConfig;

console.log("[Config] Loaded and validated configuration from config.yml");

module.exports = {
  MCP_SERVER_PORT,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
};
