// mcp-server/src/routes/knowledgeGraphAPI.js
// Phase 6.4: REST API for the LightRAG entity/relation knowledge graph.
//
// Routes:
//   GET /api/graph/entities              — search/list entities
//   GET /api/graph/entity/:id/neighbors  — entity + 1-hop neighbors
//   GET /api/graph/stats                 — entity/relation counts per KB
//
// Authentication: JWT required.

"use strict";

const express = require("express");
const { prisma } = require("../prisma");
const { authMiddleware } = require("../middleware/authMiddleware");
const logger = require("../logger");

const router = express.Router();

// All graph routes require authentication
router.use("/api/graph", authMiddleware);

// ── GET /api/graph/entities ───────────────────────────────────────────────────
// Search or list entities in the knowledge graph.
//
// Query params:
//   kbId   (optional) — filter by knowledge base
//   search (optional) — text search on entity name
//   type   (optional) — filter by entity type (PERSON, ORG, CONCEPT, etc.)
//   limit  (optional) — default 20, max 100
//   offset (optional) — default 0

router.get("/api/graph/entities", async (req, res) => {
  const { kbId, search, type, limit: limitStr, offset: offsetStr } = req.query;

  const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 20));
  const offset = Math.max(0, parseInt(offsetStr, 10) || 0);

  const where = {};
  if (kbId) where.kbId = kbId;
  if (type) where.type = type;
  if (search) where.name = { contains: search, mode: "insensitive" };

  try {
    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { subjectOf: true, objectOf: true } },
        },
      }),
      prisma.entity.count({ where }),
    ]);

    res.json({
      total,
      limit,
      offset,
      entities: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
        kbId: e.kbId,
        documentId: e.documentId,
        createdAt: e.createdAt,
        relationCount: e._count.subjectOf + e._count.objectOf,
      })),
    });
  } catch (err) {
    logger.error("[GraphAPI] Error fetching entities:", err.message);
    res.status(500).json({ error: "Failed to fetch entities." });
  }
});

// ── GET /api/graph/entity/:id/neighbors ──────────────────────────────────────
// Returns an entity and all its directly connected entities (1-hop neighborhood).
// Useful for building entity relationship visualizations.
//
// Query params:
//   hops  (optional) — traversal depth 1-2, default 1

router.get("/api/graph/entity/:id/neighbors", async (req, res) => {
  const { id } = req.params;
  const hops = Math.min(2, Math.max(1, parseInt(req.query.hops, 10) || 1));

  try {
    const entity = await prisma.entity.findUnique({
      where: { id },
      include: {
        subjectOf: {
          take: 20,
          include: {
            Object: {
              select: { id: true, name: true, type: true },
              ...(hops > 1
                ? {
                    include: {
                      subjectOf: {
                        take: 5,
                        include: { Object: { select: { id: true, name: true, type: true } } },
                      },
                    },
                  }
                : {}),
            },
          },
        },
        objectOf: {
          take: 20,
          include: {
            Subject: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    if (!entity) {
      return res.status(404).json({ error: `Entity not found: ${id}` });
    }

    res.json({
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        kbId: entity.kbId,
        documentId: entity.documentId,
      },
      outgoing: entity.subjectOf.map((r) => ({
        predicate: r.predicate,
        target: r.Object
          ? { id: r.Object.id, name: r.Object.name, type: r.Object.type }
          : null,
      })),
      incoming: entity.objectOf.map((r) => ({
        predicate: r.predicate,
        source: r.Subject
          ? { id: r.Subject.id, name: r.Subject.name, type: r.Subject.type }
          : null,
      })),
    });
  } catch (err) {
    logger.error("[GraphAPI] Error fetching entity neighbors:", err.message);
    res.status(500).json({ error: "Failed to fetch entity neighbors." });
  }
});

// ── GET /api/graph/stats ──────────────────────────────────────────────────────
// Returns entity and relation counts, optionally scoped to a KB.

router.get("/api/graph/stats", async (req, res) => {
  const { kbId } = req.query;

  const where = kbId ? { kbId } : {};

  try {
    const [entityCount, relationCount, typeCounts] = await Promise.all([
      prisma.entity.count({ where }),
      prisma.relation.count({ where: kbId ? { kbId } : {} }),
      prisma.entity.groupBy({
        by: ["type"],
        where,
        _count: { type: true },
        orderBy: { _count: { type: "desc" } },
      }),
    ]);

    res.json({
      kbId: kbId || "all",
      entityCount,
      relationCount,
      entityTypeBreakdown: typeCounts.map((t) => ({
        type: t.type,
        count: t._count.type,
      })),
    });
  } catch (err) {
    logger.error("[GraphAPI] Error fetching graph stats:", err.message);
    res.status(500).json({ error: "Failed to fetch graph stats." });
  }
});

module.exports = router;
