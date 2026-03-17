// mcp-server/src/schemas/streamAskSchema.js
// Zod schema for the POST /api/stream-ask endpoint body.

"use strict";

const { z } = require("zod");

const StreamAskBodySchema = z.object({
  query: z
    .string({ required_error: "query is required" })
    .min(1, "query must not be empty"),
  top_k: z
    .number()
    .int("top_k must be an integer")
    .positive("top_k must be a positive integer")
    .optional(),
  documents: z.array(z.string()).optional(),
  kbId: z.string().uuid("kbId must be a valid UUID").optional(),
  // Phase 2.1: chatId for fetching conversation history to enable query reformulation
  chatId: z.string().optional(),
});

module.exports = { StreamAskBodySchema };
