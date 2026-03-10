// mcp-server/src/schemas/userDocumentsSchema.js
// Zod schema for the GET /api/user-documents query parameters.
// Uses z.coerce.number().int() so non-integer strings (e.g. "2.5") are rejected
// rather than silently truncated by parseInt().

"use strict";

const { z } = require("zod");

const UserDocumentsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("page must be an integer")
    .positive("page must be a positive integer")
    .optional(),
  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be >= 1")
    .max(100, "limit must be <= 100")
    .optional(),
});

module.exports = { UserDocumentsQuerySchema };
