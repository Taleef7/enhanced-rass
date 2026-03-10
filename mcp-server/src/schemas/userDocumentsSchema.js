// mcp-server/src/schemas/userDocumentsSchema.js
// Zod schema for the GET /api/user-documents query parameters.

"use strict";

const { z } = require("zod");

const UserDocumentsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(
      z
        .number()
        .int()
        .positive("page must be a positive integer")
        .optional()
    ),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(
      z
        .number()
        .int()
        .min(1, "limit must be >= 1")
        .max(100, "limit must be <= 100")
        .optional()
    ),
});

module.exports = { UserDocumentsQuerySchema };
