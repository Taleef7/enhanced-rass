// mcp-server/src/services/kgExtractionService.js
// Phase G #137: Knowledge graph entity and relation extraction service.
//
// Uses an LLM (via the rass-engine-service) to extract structured entities and
// relations from document chunks stored in OpenSearch. Results are persisted to
// the Entity and Relation Prisma models.
//
// Extraction is incremental — chunks that have already been processed are skipped
// (tracked by chunkId). This allows re-running extraction after adding new documents
// without re-processing the entire knowledge base.

"use strict";

const axios = require("axios");
const { prisma } = require("../prisma");
const logger = require("../logger");

const RASS_ENGINE_BASE_URL =
  process.env.RASS_ENGINE_URL || "http://rass-engine-service:8000";

const ENTITY_EXTRACTION_PROMPT = `You are an expert information extraction system. Given the text passage below, extract all named entities and the relationships between them.

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "entities": [
    { "name": "Entity Name", "type": "person|organization|drug|disease|concept|location|other" }
  ],
  "relations": [
    { "subject": "Entity Name 1", "predicate": "relation verb phrase", "object": "Entity Name 2" }
  ]
}

Rules:
- Each entity name must appear in the text.
- Relations must be between entities you extracted.
- relation predicate should be a short verb phrase (e.g., "is founder of", "treats", "located in").
- Limit to the 10 most important entities and 15 most important relations.
- If no entities or relations can be found, return empty arrays.

Text:
`;

/**
 * Calls the rass-engine-service /ask endpoint to perform entity extraction.
 * We re-use the rass-engine as an LLM proxy to avoid duplicating LLM client code.
 *
 * @param {string} text - The chunk text to extract from.
 * @returns {Promise<{entities: object[], relations: object[]}>}
 */
async function extractFromText(text) {
  try {
    const response = await axios.post(
      `${RASS_ENGINE_BASE_URL}/ask`,
      {
        query: ENTITY_EXTRACTION_PROMPT + text.substring(0, 2000),
        top_k: 0, // No retrieval needed — we're passing the text directly
      },
      { timeout: 30000 }
    );

    const answer = response.data?.answer || "";
    // Try to parse the JSON from the LLM response
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[KG] LLM did not return valid JSON for extraction");
      return { entities: [], relations: [] };
    }
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.warn(`[KG] Extraction LLM call failed: ${err.message}`);
    return { entities: [], relations: [] };
  }
}

/**
 * Extracts knowledge graph entities and relations for all documents in a knowledge base.
 * Incremental — skips chunks already extracted (chunkId in Entity table).
 *
 * @param {string} kbId   - Knowledge base ID.
 * @param {string} userId - Owner user ID (for provenance).
 */
async function extractKnowledgeGraph(kbId, userId) {
  logger.info(`[KG] Starting extraction for KB ${kbId}`);

  // Fetch all documents in this KB
  const documents = await prisma.document.findMany({
    where: { kbId, status: "READY" },
    select: { id: true, originalFilename: true },
  });

  if (documents.length === 0) {
    logger.info("[KG] No ready documents found in KB — skipping extraction");
    return;
  }

  let totalEntities = 0;
  let totalRelations = 0;

  for (const doc of documents) {
    // Fetch the document's provenance to find chunk text
    const provenance = await prisma.documentProvenance.findFirst({
      where: { documentId: doc.id },
    });

    if (!provenance) continue;

    // Skip if already extracted for this document
    const existingCount = await prisma.entity.count({
      where: { documentId: doc.id, kbId },
    });
    if (existingCount > 0) {
      logger.info(`[KG] Skipping doc ${doc.id} (already extracted ${existingCount} entities)`);
      continue;
    }

    // Use the document's stored chunks for extraction. We fetch the provenance
    // text to ground entity extraction in the actual ingested content.
    const extractionText = provenance.chunkText
      ? `${doc.originalFilename}\n\n${provenance.chunkText}`
      : `Document: ${doc.originalFilename}`;
    const { entities, relations } = await extractFromText(extractionText);

    if (entities.length === 0) {
      logger.info(`[KG] No entities found in doc ${doc.id}`);
      continue;
    }

    // Persist entities
    const entityMap = {};
    for (const e of entities) {
      if (!e.name || !e.type) continue;
      try {
        const entity = await prisma.entity.create({
          data: {
            name: e.name.trim(),
            type: (e.type || "other").toLowerCase(),
            description: null,
            kbId,
            documentId: doc.id,
          },
        });
        entityMap[e.name.trim()] = entity.id;
        totalEntities++;
      } catch (err) {
        logger.warn(`[KG] Skipping duplicate entity "${e.name}": ${err.message}`);
      }
    }

    // Persist relations
    for (const r of relations) {
      const subjectId = entityMap[r.subject?.trim()];
      const objectId = entityMap[r.object?.trim()];
      if (!subjectId || !objectId || !r.predicate) continue;
      try {
        await prisma.relation.create({
          data: {
            subjectId,
            predicate: r.predicate.trim(),
            objectId,
            kbId,
          },
        });
        totalRelations++;
      } catch (err) {
        logger.warn(`[KG] Skipping relation: ${err.message}`);
      }
    }

    logger.info(`[KG] Doc ${doc.id}: ${entities.length} entities, ${relations.length} relations`);
  }

  logger.info(`[KG] Extraction complete: ${totalEntities} entities, ${totalRelations} relations for KB ${kbId}`);
}

module.exports = { extractKnowledgeGraph };
