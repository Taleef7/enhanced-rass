// mcp-server/src/routes/knowledgeGraph.js
// Phase G #137: Knowledge graph API.
//
// Routes:
//   GET  /api/knowledge-bases/:kbId/graph   — Get entities and relations for a KB
//   GET  /api/knowledge-bases/:kbId/entities — List entities (paginated)
//   POST /api/knowledge-bases/:kbId/graph/extract — Trigger extraction (manual)
//   GET  /api/entities/:entityId            — Single entity detail
//   GET  /api/entities/:entityId/relations  — Entity's relations

"use strict";

const express = require("express");
const authMiddleware = require("../authMiddleware");
const { prisma } = require("../prisma");
const { apiLimiter } = require("../middleware/rateLimits");
const logger = require("../logger");

const router = express.Router();

// ── GET /api/knowledge-bases/:kbId/graph ─────────────────────────────────────

router.get(
  "/api/knowledge-bases/:kbId/graph",
  apiLimiter,
  authMiddleware,
  async (req, res) => {
    const { kbId } = req.params;
    const userId = req.userId;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));

    try {
      // Verify access — user must own or be a member of the KB
      const kb = await prisma.knowledgeBase.findFirst({
        where: { id: kbId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      });
      if (!kb) return res.status(404).json({ error: "Knowledge base not found." });

      const [entities, relations] = await Promise.all([
        prisma.entity.findMany({
          where: { kbId },
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.relation.findMany({
          where: { kbId },
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            Subject: { select: { id: true, name: true, type: true } },
            Object: { select: { id: true, name: true, type: true } },
          },
        }),
      ]);

      // Return in a format compatible with react-force-graph-2d / D3
      res.json({
        nodes: entities.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description || null,
          documentId: e.documentId || null,
          chunkId: e.chunkId || null,
        })),
        links: relations.map((r) => ({
          id: r.id,
          source: r.subjectId,
          target: r.objectId,
          label: r.predicate,
          chunkId: r.chunkId || null,
        })),
        kbId,
        entityCount: entities.length,
        relationCount: relations.length,
      });
    } catch (err) {
      logger.error("[KG] Failed to get graph:", err.message);
      res.status(500).json({ error: "Failed to fetch knowledge graph." });
    }
  }
);

// ── GET /api/knowledge-bases/:kbId/entities ───────────────────────────────────

router.get(
  "/api/knowledge-bases/:kbId/entities",
  apiLimiter,
  authMiddleware,
  async (req, res) => {
    const { kbId } = req.params;
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    const typeFilter = req.query.type || undefined;

    try {
      const kb = await prisma.knowledgeBase.findFirst({
        where: { id: kbId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      });
      if (!kb) return res.status(404).json({ error: "Knowledge base not found." });

      const where = { kbId, ...(typeFilter ? { type: typeFilter } : {}) };
      const [entities, total] = await Promise.all([
        prisma.entity.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
        prisma.entity.count({ where }),
      ]);

      res.json({ items: entities, total, page, limit });
    } catch (err) {
      logger.error("[KG] Failed to list entities:", err.message);
      res.status(500).json({ error: "Failed to list entities." });
    }
  }
);

// ── GET /api/entities/:entityId ───────────────────────────────────────────────

router.get("/api/entities/:entityId", apiLimiter, authMiddleware, async (req, res) => {
  const { entityId } = req.params;
  try {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      include: {
        subjectOf: {
          include: { Object: { select: { id: true, name: true, type: true } } },
        },
        objectOf: {
          include: { Subject: { select: { id: true, name: true, type: true } } },
        },
      },
    });
    if (!entity) return res.status(404).json({ error: "Entity not found." });
    res.json(entity);
  } catch (err) {
    logger.error("[KG] Failed to fetch entity:", err.message);
    res.status(500).json({ error: "Failed to fetch entity." });
  }
});

// ── POST /api/knowledge-bases/:kbId/graph/extract ────────────────────────────

router.post(
  "/api/knowledge-bases/:kbId/graph/extract",
  apiLimiter,
  authMiddleware,
  async (req, res) => {
    const { kbId } = req.params;
    const userId = req.userId;

    try {
      const kb = await prisma.knowledgeBase.findFirst({
        where: { id: kbId, ownerId: userId },
      });
      if (!kb) return res.status(404).json({ error: "Knowledge base not found." });

      // Enqueue extraction via the mcp-server's internal extraction service
      const { extractKnowledgeGraph } = require("../services/kgExtractionService");
      // Fire-and-forget — return 202 immediately
      extractKnowledgeGraph(kbId, userId).catch((e) => {
        logger.error("[KG] Background extraction error:", e.message);
      });

      res.status(202).json({ message: "Knowledge graph extraction started.", kbId });
    } catch (err) {
      logger.error("[KG] Failed to start extraction:", err.message);
      res.status(500).json({ error: "Failed to start extraction." });
    }
  }
);

module.exports = router;
