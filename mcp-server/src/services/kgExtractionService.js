// mcp-server/src/services/kgExtractionService.js
// Phase G #137: Knowledge graph entity and relation extraction service.
//
// Uses the rass-engine-service as a prompt-only LLM proxy to extract
// structured entities and relations from the chunk text already stored in
// OpenSearch for a knowledge base.

"use strict";

const axios = require("axios");
const { prisma } = require("../prisma");
const logger = require("../logger");
const { OPENSEARCH_HOST, OPENSEARCH_PORT } = require("../config");

const RASS_ENGINE_BASE_URL =
  process.env.RASS_ENGINE_URL || "http://rass-engine-service:8000";
const OPENSEARCH_BASE_URL = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;

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

async function extractFromText(text) {
  try {
    const response = await axios.post(
      `${RASS_ENGINE_BASE_URL}/generate`,
      {
        prompt: ENTITY_EXTRACTION_PROMPT + text.substring(0, 6000),
        temperature: 0.1,
        max_tokens: 800,
      },
      { timeout: 30000 }
    );

    const answer = response.data?.text || "";
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

async function buildExtractionText(indexName, doc) {
  try {
    const response = await axios.post(
      `${OPENSEARCH_BASE_URL}/${indexName}/_search`,
      {
        size: 12,
        _source: ["text"],
        query: {
          bool: {
            should: [
              { term: { "metadata.documentId.keyword": doc.id } },
              { term: { "metadata.documentId": doc.id } },
            ],
            minimum_should_match: 1,
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    const chunkTexts = (response.data?.hits?.hits || [])
      .map((hit) => hit?._source?.text?.trim())
      .filter(Boolean);

    if (chunkTexts.length === 0) {
      return `Document: ${doc.originalFilename}`;
    }

    return `${doc.originalFilename}\n\n${chunkTexts.join("\n\n")}`.slice(0, 6000);
  } catch (err) {
    logger.warn(`[KG] Could not fetch chunk text for doc ${doc.id}: ${err.message}`);
    return `Document: ${doc.originalFilename}`;
  }
}

async function extractKnowledgeGraph(kbId, userId) {
  logger.info(`[KG] Starting extraction for KB ${kbId}`);

  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: kbId },
    select: { id: true, openSearchIndex: true },
  });

  if (!kb) {
    logger.warn(`[KG] Knowledge base ${kbId} not found; skipping extraction`);
    return;
  }

  const documents = await prisma.document.findMany({
    where: { kbId, status: "READY" },
    select: { id: true, originalFilename: true },
  });

  if (documents.length === 0) {
    logger.info("[KG] No ready documents found in KB; skipping extraction");
    return;
  }

  let totalEntities = 0;
  let totalRelations = 0;

  for (const doc of documents) {
    const existingCount = await prisma.entity.count({
      where: { documentId: doc.id, kbId },
    });
    if (existingCount > 0) {
      logger.info(
        `[KG] Skipping doc ${doc.id} (already extracted ${existingCount} entities)`
      );
      continue;
    }

    const extractionText = await buildExtractionText(kb.openSearchIndex, doc);
    const { entities, relations } = await extractFromText(extractionText);

    if (entities.length === 0) {
      logger.info(`[KG] No entities found in doc ${doc.id}`);
      continue;
    }

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

    logger.info(
      `[KG] Doc ${doc.id}: ${entities.length} entities, ${relations.length} relations`
    );
  }

  logger.info(
    `[KG] Extraction complete: ${totalEntities} entities, ${totalRelations} relations for KB ${kbId} (requested by ${userId})`
  );
}

module.exports = { extractKnowledgeGraph };
