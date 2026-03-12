// mcp-server/src/routes/annotations.js
// Phase G #138: Real-time collaborative annotation endpoints.
//
// Routes:
//   GET    /api/annotations             — Get annotations for chunks (by chunkId or documentId)
//   POST   /api/annotations             — Create a new annotation
//   PATCH  /api/annotations/:id         — Update an annotation
//   DELETE /api/annotations/:id         — Delete an annotation

"use strict";

const express = require("express");
const { z } = require("zod");
const authMiddleware = require("../authMiddleware");
const { prisma } = require("../prisma");
const { apiLimiter } = require("../middleware/rateLimits");
const logger = require("../logger");

const router = express.Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const VALID_TYPES = ["NOTE", "FLAG_OUTDATED", "FLAG_INCORRECT", "AUTHORITATIVE", "BOOKMARK"];

const CreateAnnotationSchema = z.object({
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  workspaceId: z.string().optional(),
  annotationType: z.enum(VALID_TYPES),
  content: z.string().max(5000).optional(),
});

const UpdateAnnotationSchema = z.object({
  annotationType: z.enum(VALID_TYPES).optional(),
  content: z.string().max(5000).optional(),
});

// ── GET /api/annotations ──────────────────────────────────────────────────────

router.get("/api/annotations", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { chunkId, documentId, workspaceId } = req.query;

  if (!chunkId && !documentId && !workspaceId) {
    return res.status(400).json({ error: "At least one of chunkId, documentId, or workspaceId is required." });
  }

  try {
    // Always show the user's own annotations.
    // Only surface other users' AUTHORITATIVE annotations when the caller
    // explicitly provides a workspaceId (avoids leaking cross-tenant data).
    const where = {
      OR: [{ userId }],
    };
    if (workspaceId) {
      where.OR.push({ annotationType: "AUTHORITATIVE", workspaceId });
      where.workspaceId = workspaceId;
    }

    if (chunkId) where.chunkId = chunkId;
    if (documentId) where.documentId = documentId;

    const annotations = await prisma.annotation.findMany({
      where,
      include: { User: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ items: annotations });
  } catch (err) {
    logger.error("[Annotation] GET failed:", err.message);
    res.status(500).json({ error: "Failed to fetch annotations." });
  }
});

// ── POST /api/annotations ─────────────────────────────────────────────────────

router.post("/api/annotations", apiLimiter, authMiddleware, async (req, res) => {
  const parse = CreateAnnotationSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid annotation payload", details: parse.error.issues });
  }

  const { chunkId, documentId, workspaceId, annotationType, content } = parse.data;
  const userId = req.userId;

  try {
    const annotation = await prisma.annotation.create({
      data: {
        chunkId,
        documentId,
        userId,
        workspaceId: workspaceId || null,
        annotationType,
        content: content || null,
      },
      include: { User: { select: { id: true, username: true } } },
    });

    logger.info(`[Annotation] Created ${annotationType} annotation on chunk ${chunkId} by user ${userId}`);

    // Broadcast to WebSocket subscribers for real-time collaboration
    broadcastAnnotation("create", annotation);

    res.status(201).json(annotation);
  } catch (err) {
    logger.error("[Annotation] POST failed:", err.message);
    res.status(500).json({ error: "Failed to create annotation." });
  }
});

// ── PATCH /api/annotations/:id ────────────────────────────────────────────────

router.patch("/api/annotations/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const parse = UpdateAnnotationSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid update payload", details: parse.error.issues });
  }

  try {
    const existing = await prisma.annotation.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Annotation not found." });
    if (existing.userId !== userId) return res.status(403).json({ error: "Not authorised to update this annotation." });

    const updated = await prisma.annotation.update({
      where: { id },
      data: parse.data,
      include: { User: { select: { id: true, username: true } } },
    });

    broadcastAnnotation("update", updated);
    res.json(updated);
  } catch (err) {
    logger.error("[Annotation] PATCH failed:", err.message);
    res.status(500).json({ error: "Failed to update annotation." });
  }
});

// ── DELETE /api/annotations/:id ───────────────────────────────────────────────

router.delete("/api/annotations/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const existing = await prisma.annotation.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Annotation not found." });
    if (existing.userId !== userId) return res.status(403).json({ error: "Not authorised to delete this annotation." });

    await prisma.annotation.delete({ where: { id } });

    broadcastAnnotation("delete", { id, chunkId: existing.chunkId, documentId: existing.documentId });
    res.json({ message: "Annotation deleted." });
  } catch (err) {
    logger.error("[Annotation] DELETE failed:", err.message);
    res.status(500).json({ error: "Failed to delete annotation." });
  }
});

// ── WebSocket broadcast ───────────────────────────────────────────────────────

/**
 * Broadcasts an annotation event to relevant WebSocket clients.
 * Only sends to authenticated clients who have subscribed to the annotation's
 * workspace (or to the annotation owner when no workspace is set).
 *
 * @param {'create'|'update'|'delete'} event
 * @param {object} payload  - Must include workspaceId and userId fields.
 */
function broadcastAnnotation(event, payload) {
  try {
    const { getAnnotationWss } = require("../websocket/annotationWss");
    const wss = getAnnotationWss();
    if (!wss) return;

    const { workspaceId, userId: annotationOwnerId } = payload;
    const message = JSON.stringify({ event: `annotation:${event}`, data: payload });

    wss.clients.forEach((client) => {
      if (client.readyState !== 1 /* OPEN */ || !client.userId) return;

      const isOwner = client.userId === annotationOwnerId;
      const isSubscribed = workspaceId && client.subscribedWorkspaces?.has(workspaceId);

      if (isOwner || isSubscribed) {
        client.send(message);
      }
    });
  } catch (err) {
    // WebSocket server not available — non-fatal
    logger.debug("[Annotation] WebSocket broadcast skipped:", err.message);
  }
}

module.exports = router;
