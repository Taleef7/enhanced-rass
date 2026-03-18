// mcp-server/src/routes/internalService.js
// Internal service-to-service routes protected by a shared secret header.
// These routes are called only by other backend services (e.g. embedding-service worker).
// They are NOT meant to be reachable by end users.
//
// Authentication: every request must carry the header:
//   X-Internal-Token: <INTERNAL_SERVICE_TOKEN env var>
//
// Routes:
//   PATCH  /internal/documents/:id/status   — Update document lifecycle status
//   POST   /internal/documents/:id/provenance — Persist ETL provenance record
//   POST   /internal/audit                  — Write an audit log entry

"use strict";

const express = require("express");
const { writeAuditLog } = require("../services/auditService");
const { prisma } = require("../prisma");
const logger = require("../logger");

const router = express.Router();

// ── Shared-secret guard ───────────────────────────────────────────────────────
// INTERNAL_SERVICE_TOKEN must be set in production. In development, if unset,
// the server logs a prominent warning on every request but still allows traffic
// (to avoid breaking local dev without Docker secrets configured).

const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

router.use("/internal", (req, res, next) => {
  if (!INTERNAL_SERVICE_TOKEN) {
    logger.warn(
      "[Internal] WARNING: INTERNAL_SERVICE_TOKEN is not set. " +
      "Internal routes are UNSECURED. Set this env var in production."
    );
    return next();
  }
  const provided = req.headers["x-internal-token"];
  if (!provided || provided !== INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
});

// ── PATCH /internal/documents/:id/status ─────────────────────────────────────

router.patch("/internal/documents/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status, errorMessage, chunkCount, processedAt } = req.body;

  const validStatuses = ["QUEUED", "PROCESSING", "READY", "FAILED", "DELETED"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  try {
    const update = { status };
    if (errorMessage !== undefined) update.errorMessage = errorMessage;
    if (chunkCount !== undefined) update.chunkCount = chunkCount;
    if (processedAt) update.processedAt = new Date(processedAt);
    if (status === "DELETED") update.deletedAt = new Date();

    const doc = await prisma.document.update({
      where: { id },
      data: update,
    });

    logger.info(`[Internal] Document ${id} status → ${status}`);
    res.json({ id: doc.id, status: doc.status });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: `Document ${id} not found.` });
    }
    logger.error("[Internal] Error updating document status:", err.message);
    res.status(500).json({ error: "Failed to update document status." });
  }
});

// ── POST /internal/documents/:id/provenance ───────────────────────────────────

router.post("/internal/documents/:id/provenance", async (req, res) => {
  const { id: documentId } = req.params;
  const {
    userId,
    ingestionJobId,
    rawFileSha256,
    fileType,
    fileSizeBytes,
    pageCount,
    chunkingStrategy,
    embeddingModel,
    embeddingDim,
    chunkCount,
    parentCount,
    stagesMs,
  } = req.body;

  try {
    // Check if a provenance record already exists (idempotent)
    const existing = await prisma.documentProvenance.findUnique({
      where: { documentId },
    });
    if (existing) {
      return res.json(existing);
    }

    const provenance = await prisma.documentProvenance.create({
      data: {
        documentId,
        userId,
        ingestionJobId: String(ingestionJobId),
        rawFileSha256,
        fileType,
        fileSizeBytes,
        pageCount,
        chunkingStrategy,
        embeddingModel,
        embeddingDim,
        chunkCount,
        parentCount,
        stagesMs,
      },
    });

    logger.info(`[Internal] Provenance created for document ${documentId}`);
    res.status(201).json(provenance);
  } catch (err) {
    logger.error("[Internal] Error creating provenance:", err.message);
    res.status(500).json({ error: "Failed to create provenance record." });
  }
});

// ── POST /internal/audit ──────────────────────────────────────────────────────

router.post("/internal/audit", async (req, res) => {
  const { userId, action, resource, resourceType, resourceId, outcome, metadata, workspaceId } = req.body;
  await writeAuditLog({ userId, action, resource, resourceType, resourceId, outcome, metadata, workspaceId });
  res.status(201).json({ ok: true });
});

// ── Phase G: Internal feedback endpoints for rass-engine ─────────────────────

/**
 * GET /internal/feedback/ab-group/:userId
 * Returns the A/B group for a given user (deterministic hash).
 */
router.get("/internal/feedback/ab-group/:userId", (req, res) => {
  const { userId } = req.params;
  const sum = userId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const abGroup = sum % 2 === 0 ? "a" : "b";
  res.json({ userId, abGroup });
});

/**
 * GET /internal/feedback/boosts/:userId
 * Returns a boost multiplier map keyed by documentId / chunkId.
 * Positive feedback → POSITIVE_BOOST (1.5x)
 * Negative feedback → NEGATIVE_PENALTY (0.4x)
 * Aggregated over the last 90 days.
 */
router.get("/internal/feedback/boosts/:userId", async (req, res) => {
  const { userId } = req.params;
  const POSITIVE_BOOST = Number(process.env.POSITIVE_FEEDBACK_BOOST) || 1.5;
  const NEGATIVE_PENALTY = Number(process.env.NEGATIVE_FEEDBACK_PENALTY) || 0.4;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  try {
    const records = await prisma.retrievalFeedback.findMany({
      where: {
        userId,
        feedbackType: { in: ["positive", "negative"] },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
    });

    const tally = {};
    for (const r of records) {
      const key = r.documentId || r.chunkId;
      if (!key) continue;
      if (!tally[key]) tally[key] = { positive: 0, negative: 0 };
      tally[key][r.feedbackType]++;
    }

    const boosts = {};
    for (const [key, counts] of Object.entries(tally)) {
      if (counts.positive > counts.negative) {
        boosts[key] = POSITIVE_BOOST;
      } else if (counts.negative > counts.positive) {
        boosts[key] = NEGATIVE_PENALTY;
      }
    }

    res.json({ userId, boosts });
  } catch (err) {
    logger.error("[Internal/Feedback] Failed to compute boosts:", err.message);
    res.status(500).json({ error: "Failed to compute feedback boosts." });
  }
});

// ── Phase 4: Internal memories endpoint for rass-engine-service ───────────────

/**
 * GET /internal/memories
 * Returns recent memories for a user, optionally filtered by keyword query.
 * Called by rass-engine-service/QueryReformulationStage to inject user context.
 *
 * Query params:
 *   userId  (required) — user ID
 *   query   (optional) — keyword filter
 *   limit   (optional) — default 5, max 20
 */
router.get("/internal/memories", async (req, res) => {
  const { userId, query, limit: limitStr } = req.query;

  if (!userId) return res.status(400).json({ error: "userId is required." });

  const limit = Math.min(20, Math.max(1, parseInt(limitStr, 10) || 5));

  const where = { userId };
  if (query) where.fact = { contains: query, mode: "insensitive" };

  try {
    const memories = await prisma.memory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, fact: true, category: true, createdAt: true },
    });
    res.json({ userId, memories });
  } catch (err) {
    logger.error("[Internal/Memories] Failed to fetch memories:", err.message);
    res.status(500).json({ error: "Failed to fetch memories." });
  }
});

// ── Phase 6.2: Internal graph entity ingestion endpoint ───────────────────────
//
// POST /internal/graph/entities
// Called by embedding-service after ingestion (when GRAPH_EXTRACTION_ENABLED: true).
// Accepts extracted entities + relations and upserts them into Postgres.
//
// Body:
//   {
//     entities: [{ name, type, description?, documentId?, chunkId?, kbId }],
//     relations: [{ subjectName, predicate, objectName, kbId, chunkId? }]
//   }

router.post("/internal/graph/entities", async (req, res) => {
  const { entities = [], relations = [], kbId } = req.body;

  if (!Array.isArray(entities) || !kbId) {
    return res.status(400).json({ error: "entities array and kbId are required." });
  }

  try {
    const upsertedEntities = {};

    // Upsert entities (match on name + kbId)
    for (const e of entities) {
      if (!e.name || !e.type) continue;
      const entity = await prisma.entity.upsert({
        where: { id: `${kbId}::${e.name.toLowerCase()}` },
        update: {
          type: e.type,
          description: e.description || undefined,
          documentId: e.documentId || undefined,
          chunkId: e.chunkId || undefined,
        },
        create: {
          id: `${kbId}::${e.name.toLowerCase()}`,
          name: e.name,
          type: e.type,
          kbId,
          description: e.description || undefined,
          documentId: e.documentId || undefined,
          chunkId: e.chunkId || undefined,
        },
      });
      upsertedEntities[e.name.toLowerCase()] = entity.id;
    }

    // Create relations between upserted entities
    let relationCount = 0;
    for (const r of relations) {
      if (!r.subjectName || !r.predicate || !r.objectName) continue;
      const subjectId = upsertedEntities[r.subjectName.toLowerCase()];
      const objectId = upsertedEntities[r.objectName.toLowerCase()];
      if (!subjectId || !objectId) continue;

      // Skip duplicate relations (idempotent via try/catch)
      try {
        await prisma.relation.create({
          data: {
            subjectId,
            predicate: r.predicate,
            objectId,
            kbId,
            chunkId: r.chunkId || undefined,
          },
        });
        relationCount++;
      } catch (_) {
        // Ignore duplicate relations
      }
    }

    logger.info(
      `[Internal/Graph] Upserted ${Object.keys(upsertedEntities).length} entities, ${relationCount} relations for kbId=${kbId}`
    );
    res.status(201).json({
      entities: Object.keys(upsertedEntities).length,
      relations: relationCount,
    });
  } catch (err) {
    logger.error("[Internal/Graph] Error upserting entities:", err.message);
    res.status(500).json({ error: "Failed to upsert graph entities." });
  }
});

// ── Phase 6.3: Internal graph query endpoint for rass-engine ──────────────────
//
// GET /internal/graph/neighbors
// Called by GraphExpansionStage to find entity neighbors for retrieved docs.
//
// Query params:
//   kbId     (required) — knowledge base scope
//   terms    (required) — comma-separated search terms
//   limit    (optional) — max entities to return (default: 10)

router.get("/internal/graph/neighbors", async (req, res) => {
  const { kbId, terms: termsStr, limit: limitStr } = req.query;

  if (!kbId || !termsStr) {
    return res.status(400).json({ error: "kbId and terms are required." });
  }

  const terms = termsStr.split(",").map((t) => t.trim()).filter(Boolean);
  const limit = Math.min(50, Math.max(1, parseInt(limitStr, 10) || 10));

  try {
    // Find entities matching any of the search terms
    const entities = await prisma.entity.findMany({
      where: {
        kbId,
        OR: terms.map((t) => ({ name: { contains: t, mode: "insensitive" } })),
      },
      take: limit,
      include: {
        subjectOf: {
          take: 5,
          include: { Object: { select: { id: true, name: true, type: true, documentId: true } } },
        },
        objectOf: {
          take: 5,
          include: { Subject: { select: { id: true, name: true, type: true, documentId: true } } },
        },
      },
    });

    // Collect document IDs from matched entities + their neighbors
    const docIds = new Set();
    for (const e of entities) {
      if (e.documentId) docIds.add(e.documentId);
      for (const r of e.subjectOf) {
        if (r.Object?.documentId) docIds.add(r.Object.documentId);
      }
      for (const r of e.objectOf) {
        if (r.Subject?.documentId) docIds.add(r.Subject.documentId);
      }
    }

    res.json({ entities: entities.length, documentIds: [...docIds] });
  } catch (err) {
    logger.error("[Internal/Graph] Error querying neighbors:", err.message);
    res.status(500).json({ error: "Failed to query graph neighbors." });
  }
});

module.exports = router;
