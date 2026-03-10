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
 *
 * Follows the Phase C structured citation spec (Issue #117):
 *   index          — [1], [2], etc. (1-based position in the citations array)
 *   documentId     — unique document identifier from metadata
 *   documentName   — human-readable document name (filename or title)
 *   chunkId        — OpenSearch document ID of the source chunk
 *   relevanceScore — initial hybrid search score (or rerank score when available)
 *   excerpt        — up to 200-char snippet from the chunk text
 *   pageNumber     — page number if available in metadata
 *   uploadedAt     — ISO timestamp of when the document was ingested
 *   grounded       — whether the cited text is verifiably present in the retrieved context
 */
const CitationSchema = z.object({
  index: z.number().int().positive(),
  documentId: z.string(),
  documentName: z.string(),
  chunkId: z.string().optional(),
  relevanceScore: z.number(),
  excerpt: z.string(),
  pageNumber: z.number().int().positive().optional(),
  uploadedAt: z.string().optional(),
  grounded: z.boolean().optional(),
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
