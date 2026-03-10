// mcp-server/src/schemas/embedUploadSchema.js
// Zod schema for the POST /api/embed-upload endpoint body (multipart form fields).

"use strict";

const { z } = require("zod");

/**
 * The file itself is validated by multer (presence check).
 * This schema validates text body fields forwarded from the authenticated upload proxy.
 */
const EmbedUploadSchema = z.object({
  // userId is injected from the JWT by authMiddleware — validate it is present
  userId: z
    .string({ required_error: "userId is required" })
    .min(1, "userId must not be empty")
    .optional(), // optional here since it may come from req.user, not req.body
});

module.exports = { EmbedUploadSchema };
