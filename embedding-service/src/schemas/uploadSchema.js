// embedding-service/src/schemas/uploadSchema.js
// Zod schema for the POST /upload endpoint body.

"use strict";

const { z } = require("zod");

/**
 * Schema for the multipart form body of POST /upload.
 * Note: The `files` field is validated at the multer layer (presence check).
 * This schema validates the text fields extracted from the multipart body.
 */
const UploadBodySchema = z.object({
  userId: z
    .string({ required_error: "userId is required" })
    .min(1, "userId must not be empty"),
  // documentId is provided by the mcp-server upload proxy for registry tracking
  documentId: z.string().optional(),
  // kbId targets the upload at a specific Knowledge Base
  kbId: z.string().optional(),
  // targetIndex is the OpenSearch index resolved by the mcp-server from the KB record
  targetIndex: z.string().optional(),
  // chunkingStrategy overrides the global config for this specific upload
  chunkingStrategy: z
    .enum(["fixed_size", "recursive_character", "sentence_window"])
    .optional(),
});

module.exports = { UploadBodySchema };
