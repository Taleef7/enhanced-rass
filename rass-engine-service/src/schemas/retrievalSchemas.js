// rass-engine-service/src/schemas/retrievalSchemas.js
// Canonical Zod schemas for OpenSearch retrieval hits and LLM answer citations.
// Validates raw OpenSearch hits and assembled citations before they enter the
// generation pipeline or are serialized to the API response.

"use strict";

const { z } = require("zod");

/**
 * A single OpenSearch retrieval hit as returned by the KNN/BM25/hybrid search.
 */
const RetrievalHitSchema = z.object({
  _id: z.string(),
  _score: z.number(),
  _source: z.object({
    text: z.string(),
    metadata: z
      .object({
        userId: z.string(),
        originalFilename: z.string(),
        uploadedAt: z.string(),
        parentId: z.string().optional(),
      })
      .passthrough(), // allow additional metadata fields without stripping them
  }),
});

/**
 * An array of OpenSearch hits.
 */
const RetrievalResultSchema = z.array(RetrievalHitSchema);

/**
 * A single citation assembled for the LLM response.
 * Serialized into SSE events and the non-streaming /ask response.
 */
const CitationSchema = z.object({
  id: z.string(),
  source: z.string(),      // document filename or title
  score: z.number(),
  text: z.string(),        // relevant excerpt passed to the LLM
  uploadedAt: z.string().optional(),
});

/**
 * An array of citations.
 */
const CitationListSchema = z.array(CitationSchema);

module.exports = {
  RetrievalHitSchema,
  RetrievalResultSchema,
  CitationSchema,
  CitationListSchema,
};
