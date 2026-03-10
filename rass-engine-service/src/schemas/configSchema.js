// rass-engine-service/src/schemas/configSchema.js
// Zod schema for validating config.yml at service startup.
// Covers all fields in the shared config.yml inventory with cross-field validation.

"use strict";

const { z } = require("zod");

const ALLOWED_PROVIDERS = ["openai", "gemini"];
const providerEnum = z.enum(ALLOWED_PROVIDERS, {
  errorMap: () => ({
    message: `Must be one of: ${ALLOWED_PROVIDERS.join(", ")}`,
  }),
});

const portRange = z
  .number()
  .int()
  .min(1024, "Port must be >= 1024")
  .max(65535, "Port must be <= 65535");

const ConfigSchema = z
  .object({
    // Provider enums
    EMBEDDING_PROVIDER: providerEnum,
    LLM_PROVIDER: providerEnum,
    SEARCH_TERM_EMBEDDING_PROVIDER: providerEnum,

    // OpenSearch
    OPENSEARCH_HOST: z.string().min(1, "OPENSEARCH_HOST must not be empty"),
    OPENSEARCH_PORT: z
      .number()
      .int()
      .min(1, "OPENSEARCH_PORT must be >= 1")
      .max(65535, "OPENSEARCH_PORT must be <= 65535"),
    OPENSEARCH_INDEX_NAME: z
      .string()
      .min(1, "OPENSEARCH_INDEX_NAME must not be empty"),

    // Redis
    REDIS_HOST: z.string().min(1, "REDIS_HOST must not be empty"),
    REDIS_PORT: z
      .number()
      .int()
      .min(1, "REDIS_PORT must be >= 1")
      .max(65535, "REDIS_PORT must be <= 65535"),
    REDIS_DB: z.number().int().min(0, "REDIS_DB must be >= 0"),

    // Model names
    OPENAI_EMBED_MODEL_NAME: z.string().min(1).optional(),
    GEMINI_EMBED_MODEL_NAME: z.string().min(1).optional(),
    OPENAI_MODEL_NAME: z.string().min(1).optional(),
    GEMINI_MODEL_NAME: z.string().min(1).optional(),
    RERANKER_MODEL_NAME: z.string().min(1).optional(),

    // Service ports
    EMBEDDING_SERVICE_PORT: portRange,
    RASS_ENGINE_PORT: portRange,
    MCP_SERVER_PORT: portRange,
    RERANKER_PORT: portRange.optional(),

    // RAG parameters
    EMBED_DIM: z
      .number()
      .int()
      .positive("EMBED_DIM must be a positive integer"),
    PARENT_CHUNK_SIZE: z
      .number()
      .int()
      .positive("PARENT_CHUNK_SIZE must be a positive integer"),
    PARENT_CHUNK_OVERLAP: z
      .number()
      .int()
      .min(0, "PARENT_CHUNK_OVERLAP must be >= 0"),
    CHILD_CHUNK_SIZE: z
      .number()
      .int()
      .positive("CHILD_CHUNK_SIZE must be a positive integer"),
    CHILD_CHUNK_OVERLAP: z
      .number()
      .int()
      .min(0, "CHILD_CHUNK_OVERLAP must be >= 0"),
    DEFAULT_K_OPENSEARCH_HITS: z
      .number()
      .int()
      .positive("DEFAULT_K_OPENSEARCH_HITS must be a positive integer"),
    OPENSEARCH_SCORE_THRESHOLD: z
      .number()
      .min(0, "OPENSEARCH_SCORE_THRESHOLD must be >= 0")
      .max(1, "OPENSEARCH_SCORE_THRESHOLD must be <= 1"),

    // Nested search config
    search: z.object({
      DEFAULT_TOP_K: z
        .number()
        .int()
        .positive("search.DEFAULT_TOP_K must be a positive integer"),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.PARENT_CHUNK_OVERLAP >= data.PARENT_CHUNK_SIZE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PARENT_CHUNK_OVERLAP"],
        message: "PARENT_CHUNK_OVERLAP must be less than PARENT_CHUNK_SIZE",
      });
    }
    if (data.CHILD_CHUNK_OVERLAP >= data.CHILD_CHUNK_SIZE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CHILD_CHUNK_OVERLAP"],
        message: "CHILD_CHUNK_OVERLAP must be less than CHILD_CHUNK_SIZE",
      });
    }
    // Require the LLM model name that matches the selected LLM provider
    if (data.LLM_PROVIDER === "openai" && !data.OPENAI_MODEL_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_MODEL_NAME"],
        message: "OPENAI_MODEL_NAME is required when LLM_PROVIDER is 'openai'",
      });
    }
    if (data.LLM_PROVIDER === "gemini" && !data.GEMINI_MODEL_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_MODEL_NAME"],
        message: "GEMINI_MODEL_NAME is required when LLM_PROVIDER is 'gemini'",
      });
    }
    // Require the embedding model name for any provider that uses embeddings
    const needsOpenAIEmbed =
      data.EMBEDDING_PROVIDER === "openai" ||
      data.SEARCH_TERM_EMBEDDING_PROVIDER === "openai";
    const needsGeminiEmbed =
      data.EMBEDDING_PROVIDER === "gemini" ||
      data.SEARCH_TERM_EMBEDDING_PROVIDER === "gemini";
    if (needsOpenAIEmbed && !data.OPENAI_EMBED_MODEL_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_EMBED_MODEL_NAME"],
        message:
          "OPENAI_EMBED_MODEL_NAME is required when EMBEDDING_PROVIDER or SEARCH_TERM_EMBEDDING_PROVIDER is 'openai'",
      });
    }
    if (needsGeminiEmbed && !data.GEMINI_EMBED_MODEL_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_EMBED_MODEL_NAME"],
        message:
          "GEMINI_EMBED_MODEL_NAME is required when EMBEDDING_PROVIDER or SEARCH_TERM_EMBEDDING_PROVIDER is 'gemini'",
      });
    }
  });

module.exports = { ConfigSchema };
