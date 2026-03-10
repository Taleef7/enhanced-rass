// mcp-server/src/schemas/knowledgeBaseSchema.js
// Zod schemas for Knowledge Base management endpoints.

"use strict";

const { z } = require("zod");

const VALID_EMBEDDING_MODELS = [
  "text-embedding-004",          // Gemini
  "text-embedding-3-small",      // OpenAI
  "text-embedding-3-large",      // OpenAI
  "text-embedding-ada-002",      // OpenAI legacy
];

/**
 * Schema for POST /api/knowledge-bases body.
 */
const KBCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(100, "name must be ≤ 100 characters"),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional().default(false),
  // embeddingModel, if provided, must be one of the known supported models.
  embeddingModel: z
    .enum(VALID_EMBEDDING_MODELS, {
      errorMap: () => ({
        message: `embeddingModel must be one of: ${VALID_EMBEDDING_MODELS.join(", ")}`,
      }),
    })
    .optional(),
  // embedDim, if provided, must be a positive integer.
  embedDim: z
    .number()
    .int("embedDim must be an integer")
    .positive("embedDim must be a positive integer")
    .optional(),
});

module.exports = { KBCreateSchema };
