// embedding-service/src/schemas/configSchema.js
// Zod schema for validating config.yml at embedding-service startup.
// Re-uses the field inventory defined in Issue 2.5 with cross-field validation.

"use strict";

const { z } = require("zod");

const ALLOWED_PROVIDERS = ["openai", "gemini", "ollama"];
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
    EMBEDDING_PROVIDER: providerEnum,

    OPENSEARCH_HOST: z.string().min(1, "OPENSEARCH_HOST must not be empty"),
    OPENSEARCH_PORT: z
      .number()
      .int()
      .min(1, "OPENSEARCH_PORT must be >= 1")
      .max(65535, "OPENSEARCH_PORT must be <= 65535"),
    OPENSEARCH_INDEX_NAME: z
      .string()
      .min(1, "OPENSEARCH_INDEX_NAME must not be empty"),

    REDIS_HOST: z.string().min(1, "REDIS_HOST must not be empty"),
    REDIS_PORT: z
      .number()
      .int()
      .min(1, "REDIS_PORT must be >= 1")
      .max(65535, "REDIS_PORT must be <= 65535"),
    REDIS_DB: z.number().int().min(0, "REDIS_DB must be >= 0"),

    OPENAI_EMBED_MODEL_NAME: z.string().min(1).optional(),
    GEMINI_EMBED_MODEL_NAME: z.string().min(1).optional(),

    EMBEDDING_SERVICE_PORT: portRange,

    CHUNKING_STRATEGY: z
      .enum(["fixed_size", "recursive_character", "sentence_window"], {
        errorMap: () => ({
          message: "Must be one of: fixed_size, recursive_character, sentence_window",
        }),
      })
      .default("recursive_character"),

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

    // Phase G #135: Ollama local model support
    OLLAMA_BASE_URL: z.string().url().optional().default("http://ollama:11434"),
    OLLAMA_EMBED_MODEL: z.string().min(1).optional().default("nomic-embed-text"),

    // Phase G #136: Multi-modal / vision
    VISION_ENABLED: z.boolean().optional().default(false),
    VISION_LLM_PROVIDER: z.enum(["openai", "gemini", "ollama"]).optional().default("openai"),
    VISION_LLM_MODEL: z.string().optional().default("gpt-4o-mini"),

    // Phase 3: Contextual retrieval — LLM-generated context prefix per chunk
    CONTEXTUAL_RETRIEVAL_ENABLED: z.boolean().optional().default(false),
    CONTEXTUAL_RETRIEVAL_PROVIDER: providerEnum.optional().default("gemini"),

    // Phase 6: LightRAG entity extraction at ingestion
    GRAPH_EXTRACTION_ENABLED: z.boolean().optional().default(false),
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
    // Require the model name that matches the selected embedding provider
    if (data.EMBEDDING_PROVIDER === "openai" && !data.OPENAI_EMBED_MODEL_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_EMBED_MODEL_NAME"],
        message:
          "OPENAI_EMBED_MODEL_NAME is required when EMBEDDING_PROVIDER is 'openai'",
      });
    }
    if (data.EMBEDDING_PROVIDER === "gemini" && !data.GEMINI_EMBED_MODEL_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_EMBED_MODEL_NAME"],
        message:
          "GEMINI_EMBED_MODEL_NAME is required when EMBEDDING_PROVIDER is 'gemini'",
      });
    }
  });

module.exports = { ConfigSchema };
