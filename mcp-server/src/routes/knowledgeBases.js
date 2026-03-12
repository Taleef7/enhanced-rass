// mcp-server/src/routes/knowledgeBases.js
// Knowledge Base (BYO KB) management endpoints (authenticated).
//
// Routes:
//   POST   /api/knowledge-bases          — Create a new KB
//   GET    /api/knowledge-bases          — List KBs accessible to current user
//   GET    /api/knowledge-bases/:id      — Get single KB details
//   DELETE /api/knowledge-bases/:id      — Delete KB + its OpenSearch index + documents
//   POST   /api/knowledge-bases/:id/members — Add a member to a KB

"use strict";

const express = require("express");
const axios = require("axios");
const { z } = require("zod");
const authMiddleware = require("../authMiddleware");
const { writeAuditLog } = require("../services/auditService");
const { prisma } = require("../prisma");
const { OPENSEARCH_HOST, OPENSEARCH_PORT, EMBED_DIM } = require("../config");
const { apiLimiter, deleteLimiter } = require("../middleware/rateLimits");
const { KBCreateSchema } = require("../schemas/knowledgeBaseSchema");
const { validateBody } = require("../middleware/validate");
const logger = require("../logger");

const router = express.Router();

// ── Helper: create an OpenSearch index for a KB ───────────────────────────────

async function createKBIndex(indexName, embedDim) {
  const osUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;
  const checkRes = await axios.head(`${osUrl}/${indexName}`, {
    validateStatus: (s) => s === 200 || s === 404,
    timeout: 10000,
  });
  if (checkRes.status === 200) return; // already exists

  await axios.put(
    `${osUrl}/${indexName}`,
    {
      settings: { index: { knn: true, "knn.algo_param.ef_search": 100 } },
      mappings: {
        properties: {
          embedding: {
            type: "knn_vector",
            dimension: embedDim,
            method: {
              name: "hnsw",
              space_type: "l2",
              engine: "faiss",
              parameters: { ef_construction: 256, m: 48 },
            },
          },
        },
      },
    },
    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
  );
  logger.info(`[KB] Created OpenSearch index: ${indexName}`);
}

// ── Helper: delete an OpenSearch index ────────────────────────────────────────

async function deleteKBIndex(indexName) {
  try {
    const osUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;
    await axios.delete(`${osUrl}/${indexName}`, {
      validateStatus: (s) => s === 200 || s === 404,
      timeout: 15000,
    });
    logger.info(`[KB] Deleted OpenSearch index: ${indexName}`);
  } catch (err) {
    logger.warn(`[KB] Could not delete OpenSearch index ${indexName}: ${err.message}`);
  }
}

// ── POST /api/knowledge-bases ─────────────────────────────────────────────────

router.post("/api/knowledge-bases", apiLimiter, authMiddleware, validateBody(KBCreateSchema), async (req, res) => {
  const userId = req.userId;
  const { name, description, isPublic, embeddingModel, embedDim } = req.validatedBody;

  const resolvedEmbedDim = embedDim || EMBED_DIM;
  const resolvedModel = embeddingModel || "text-embedding-004"; // server-side default

  // Derive a unique, OpenSearch-safe index name from the KB name
  const safeBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40);
  const openSearchIndex = `kb_${safeBase}_${Date.now()}`;

  try {
    // 1. Create OpenSearch index first (fail fast before DB write)
    await createKBIndex(openSearchIndex, resolvedEmbedDim);

    let kb;
    try {
      // 2. Create DB record + auto-add creator as OWNER
      kb = await prisma.knowledgeBase.create({
        data: {
          name,
          description: description || null,
          ownerId: userId,
          isPublic: Boolean(isPublic),
          openSearchIndex,
          embeddingModel: resolvedModel,
          embedDim: resolvedEmbedDim,
        },
      });

      await prisma.kBMember.create({
        data: { kbId: kb.id, userId, role: "OWNER" },
      });
    } catch (dbErr) {
      // Rollback orphaned OpenSearch index if DB write fails
      logger.error("[KB] DB write failed; rolling back OpenSearch index:", dbErr.message);
      await deleteKBIndex(openSearchIndex);
      throw dbErr;
    }

    await writeAuditLog({
      userId,
      action: "KB_CREATED",
      resourceType: "KnowledgeBase",
      resourceId: kb.id,
      resource: kb.id,
      outcome: "SUCCESS",
      metadata: { name, openSearchIndex },
      req,
    });

    res.status(201).json(kb);
  } catch (err) {
    logger.error("[KB] Error creating knowledge base:", err.message);
    res.status(500).json({ error: "Failed to create knowledge base." });
  }
});

// ── GET /api/knowledge-bases ──────────────────────────────────────────────────

router.get("/api/knowledge-bases", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    const kbs = await prisma.knowledgeBase.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
          { isPublic: true },
        ],
      },
      include: {
        members: { select: { userId: true, role: true } },
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ knowledgeBases: kbs });
  } catch (err) {
    logger.error("[KB] Error listing knowledge bases:", err.message);
    res.status(500).json({ error: "Failed to fetch knowledge bases." });
  }
});

// ── GET /api/knowledge-bases/:id ─────────────────────────────────────────────

router.get("/api/knowledge-bases/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const kb = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
          { isPublic: true },
        ],
      },
      include: {
        members: { select: { userId: true, role: true } },
        _count: { select: { documents: true } },
      },
    });

    if (!kb) {
      return res.status(404).json({ error: "Knowledge base not found." });
    }

    res.json(kb);
  } catch (err) {
    logger.error("[KB] Error fetching knowledge base:", err.message);
    res.status(500).json({ error: "Failed to fetch knowledge base." });
  }
});

// ── DELETE /api/knowledge-bases/:id ──────────────────────────────────────────

router.delete("/api/knowledge-bases/:id", deleteLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const kb = await prisma.knowledgeBase.findFirst({
      where: { id, ownerId: userId },
    });

    if (!kb) {
      return res.status(404).json({ error: "Knowledge base not found or you do not own it." });
    }

    // 1. Delete the OpenSearch index
    await deleteKBIndex(kb.openSearchIndex);

    // 2. Mark all documents as DELETED
    await prisma.document.updateMany({
      where: { kbId: id, status: { not: "DELETED" } },
      data: { status: "DELETED", deletedAt: new Date() },
    });

    // 3. Delete KB (cascade deletes KBMember records)
    await prisma.knowledgeBase.delete({ where: { id } });

    await writeAuditLog({
      userId,
      action: "KB_DELETED",
      resourceType: "KnowledgeBase",
      resourceId: id,
      resource: id,
      outcome: "SUCCESS",
      metadata: { name: kb.name, openSearchIndex: kb.openSearchIndex },
      req,
    });

    res.json({ message: "Knowledge base deleted successfully.", id });
  } catch (err) {
    logger.error("[KB] Error deleting knowledge base:", err.message);
    res.status(500).json({ error: "Failed to delete knowledge base." });
  }
});

// ── POST /api/knowledge-bases/:id/members ────────────────────────────────────

router.post("/api/knowledge-bases/:id/members", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const requesterId = req.userId;
  const { userId: targetUserId, role = "VIEWER" } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ error: "userId is required." });
  }

  const validRoles = ["OWNER", "EDITOR", "VIEWER"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
  }

  try {
    // Only OWNER can add members
    const ownerMembership = await prisma.kBMember.findFirst({
      where: { kbId: id, userId: requesterId, role: "OWNER" },
    });
    const kb = await prisma.knowledgeBase.findFirst({ where: { id, ownerId: requesterId } });

    if (!ownerMembership && !kb) {
      return res.status(403).json({ error: "Only the KB owner can add members." });
    }

    const member = await prisma.kBMember.upsert({
      where: { kbId_userId: { kbId: id, userId: targetUserId } },
      create: { kbId: id, userId: targetUserId, role },
      update: { role },
    });

    res.status(201).json(member);
  } catch (err) {
    logger.error("[KB] Error adding member:", err.message);
    res.status(500).json({ error: "Failed to add member." });
  }
});

module.exports = router;
