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

  EMBEDDING_PROVIDER: z.enum(["openai", "gemini", "ollama"]).optional(),
  OPENAI_EMBED_MODEL_NAME: z.string().min(1).optional(),
  GEMINI_EMBED_MODEL_NAME: z.string().min(1).optional(),
  OLLAMA_EMBED_MODEL: z.string().min(1).optional(),

  OPENSEARCH_HOST: z.string().min(1, "OPENSEARCH_HOST must not be empty"),
  OPENSEARCH_PORT: z
    .number()
    .int()
    .min(1, "OPENSEARCH_PORT must be >= 1")
    .max(65535, "OPENSEARCH_PORT must be <= 65535"),
  OPENSEARCH_INDEX_NAME: z
    .string()
    .min(1, "OPENSEARCH_INDEX_NAME must not be empty"),

  EMBED_DIM: z
    .number()
    .int()
    .positive("EMBED_DIM must be a positive integer")
    .optional()
    .default(768),

  RASS_ENGINE_PORT: portRange,
  EMBEDDING_SERVICE_PORT: portRange,
});

module.exports = { ConfigSchema };
