// mcp-server/src/routes/feedback.js
// Phase G #134: Adaptive retrieval feedback endpoints.
//
// Routes:
//   POST /api/feedback           — Submit positive/negative feedback for an answer or citation
//   GET  /api/feedback           — Get feedback history for the current user
//   POST /api/feedback/implicit  — Submit implicit (click/scroll) feedback signals

"use strict";

const express = require("express");
const { z } = require("zod");
const authMiddleware = require("../authMiddleware");
const { prisma } = require("../prisma");
const { apiLimiter } = require("../middleware/rateLimits");
const logger = require("../logger");

const router = express.Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const ExplicitFeedbackSchema = z.object({
  chatMessageId: z.string().optional(),
  type: z.enum(["answer", "citation"]),
  signal: z.enum(["positive", "negative"]),
  citationId: z.string().optional(),
  chunkId: z.string().optional(),
  documentId: z.string().optional(),
  documentName: z.string().optional(),
  query: z.string().optional(),
});

const ImplicitFeedbackSchema = z.object({
  chatMessageId: z.string().optional(),
  feedbackType: z.enum(["click", "scroll"]),
  citationId: z.string().optional(),
  chunkId: z.string().optional(),
  documentId: z.string().optional(),
  documentName: z.string().optional(),
  query: z.string().optional(),
});

// ── A/B group assignment ──────────────────────────────────────────────────────

/**
 * Assigns a user to an A/B test group deterministically based on userId.
 * Group A = control (no adaptation), Group B = feedback-boosted retrieval.
 * @param {string} userId
 * @returns {'a' | 'b'}
 */
function getAbGroup(userId) {
  // Simple deterministic hashing: sum char codes mod 2
  const sum = userId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return sum % 2 === 0 ? "a" : "b";
}

// ── POST /api/feedback ────────────────────────────────────────────────────────

router.post("/api/feedback", apiLimiter, authMiddleware, async (req, res) => {
  const parse = ExplicitFeedbackSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid feedback payload", details: parse.error.issues });
  }

  const { chatMessageId, signal, citationId, chunkId, documentId, documentName, query } = parse.data;
  const userId = req.userId;
  const abGroup = getAbGroup(userId);

  try {
    const feedback = await prisma.retrievalFeedback.create({
      data: {
        userId,
        chatMessageId: chatMessageId || null,
        citationId: citationId || null,
        feedbackType: signal, // 'positive' | 'negative'
        chunkId: chunkId || null,
        documentId: documentId || null,
        documentName: documentName || null,
        query: query || null,
        abGroup,
      },
    });

    logger.info(`[Feedback] User ${userId} (group=${abGroup}) submitted ${signal} feedback for chunk ${chunkId || "N/A"}`);
    res.status(201).json({ id: feedback.id, abGroup });
  } catch (err) {
    logger.error("[Feedback] Failed to store feedback:", err.message);
    res.status(500).json({ error: "Failed to store feedback" });
  }
});

// ── POST /api/feedback/implicit ───────────────────────────────────────────────

router.post("/api/feedback/implicit", apiLimiter, authMiddleware, async (req, res) => {
  const parse = ImplicitFeedbackSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid implicit feedback payload", details: parse.error.issues });
  }

  const { chatMessageId, feedbackType, citationId, chunkId, documentId, documentName, query } = parse.data;
  const userId = req.userId;
  const abGroup = getAbGroup(userId);

  try {
    const feedback = await prisma.retrievalFeedback.create({
      data: {
        userId,
        chatMessageId: chatMessageId || null,
        citationId: citationId || null,
        feedbackType, // 'click' | 'scroll'
        chunkId: chunkId || null,
        documentId: documentId || null,
        documentName: documentName || null,
        query: query || null,
        abGroup,
      },
    });

    logger.info(`[Feedback] User ${userId} implicit ${feedbackType} on chunk ${chunkId || "N/A"}`);
    res.status(201).json({ id: feedback.id });
  } catch (err) {
    logger.error("[Feedback] Failed to store implicit feedback:", err.message);
    res.status(500).json({ error: "Failed to store implicit feedback" });
  }
});

// ── GET /api/feedback ─────────────────────────────────────────────────────────

router.get("/api/feedback", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const skip = (page - 1) * limit;

  try {
    const [items, total] = await Promise.all([
      prisma.retrievalFeedback.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.retrievalFeedback.count({ where: { userId } }),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    logger.error("[Feedback] Failed to fetch feedback history:", err.message);
    res.status(500).json({ error: "Failed to fetch feedback history" });
  }
});

// ── GET /api/feedback/ab-group ────────────────────────────────────────────────

router.get("/api/feedback/ab-group", apiLimiter, authMiddleware, (req, res) => {
  const userId = req.userId;
  const abGroup = getAbGroup(userId);
  res.json({ userId, abGroup });
});

module.exports = router;
module.exports.getAbGroup = getAbGroup;
