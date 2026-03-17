// rass-engine-service/src/schemas/askSchema.js
// Zod schemas for the /ask and /stream-ask endpoint bodies.

"use strict";

const { z } = require("zod");

/**
 * Schema for POST /ask body.
 */
const AskBodySchema = z.object({
  query: z
    .string({ required_error: "query is required" })
    .min(1, "query must not be empty"),
  top_k: z
    .number()
    .int("top_k must be an integer")
    .positive("top_k must be a positive integer")
    .optional(),
  userId: z.string().optional(),
});

/**
 * Schema for POST /stream-ask body.
 * userId is optional — when omitted, retrieval is unscoped (all documents).
 */
const StreamAskBodySchema = z.object({
  query: z
    .string({ required_error: "query is required" })
    .min(1, "query must not be empty"),
  top_k: z
    .number()
    .int("top_k must be an integer")
    .positive("top_k must be a positive integer")
    .optional(),
  userId: z.string().optional(),
  documents: z.array(z.string()).optional(),
  // 1.2: per-KB index routing — route search to the correct OpenSearch index
  kbId: z.string().optional(),
  // 2.1: conversation history for query reformulation
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

module.exports = { AskBodySchema, StreamAskBodySchema };
