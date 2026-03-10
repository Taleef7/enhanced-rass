// mcp-server/src/schemas/embedUploadSchema.js
// Zod schema for the POST /api/embed-upload endpoint body (multipart form fields).
//
// Note: The `userId` is injected from the JWT by authMiddleware (as `req.user.userId`)
// and is NOT read from the request body for this endpoint. This schema is kept as a
// placeholder for any future body fields that may be added to the upload endpoint.

"use strict";

const { z } = require("zod");

/**
 * The file itself is validated by multer (presence check).
 * userId comes from the JWT, not the body — no body fields are currently required.
 */
const EmbedUploadSchema = z.object({}).passthrough();

module.exports = { EmbedUploadSchema };
