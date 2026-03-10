// mcp-server/src/schemas/configSchema.js
// Zod schema for validating config.yml at mcp-server startup.

"use strict";

const { z } = require("zod");

const portRange = z
  .number()
  .int()
  .min(1024, "Port must be >= 1024")
  .max(65535, "Port must be <= 65535");

const ConfigSchema = z.object({
  MCP_SERVER_PORT: portRange,

  OPENSEARCH_HOST: z.string().min(1, "OPENSEARCH_HOST must not be empty"),
  OPENSEARCH_PORT: z
    .number()
    .int()
    .min(1, "OPENSEARCH_PORT must be >= 1")
    .max(65535, "OPENSEARCH_PORT must be <= 65535"),
  OPENSEARCH_INDEX_NAME: z
    .string()
    .min(1, "OPENSEARCH_INDEX_NAME must not be empty"),

  RASS_ENGINE_PORT: portRange,
  EMBEDDING_SERVICE_PORT: portRange,
});

module.exports = { ConfigSchema };
