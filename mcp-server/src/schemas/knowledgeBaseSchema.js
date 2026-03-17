// mcp-server/src/schemas/knowledgeBaseSchema.js
// Zod schemas for Knowledge Base management endpoints.

"use strict";

const { z } = require("zod");

/**
 * Schema for POST /api/knowledge-bases body.
 */
const KBCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(100, "name must be ≤ 100 characters"),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional().default(false),
  // embeddingModel is provider-dependent, so allow any explicit non-empty model name.
  embeddingModel: z.string().min(1).max(200).optional(),
  // embedDim, if provided, must be a positive integer.
  embedDim: z
    .number()
    .int("embedDim must be an integer")
    .positive("embedDim must be a positive integer")
    .optional(),
});

module.exports = { KBCreateSchema };
