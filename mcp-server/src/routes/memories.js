// mcp-server/src/routes/memories.js
// Phase 4: User Memory System — REST API for user memory facts.
//
// Routes:
//   GET    /api/memories          — list the authenticated user's memories
//   POST   /api/memories          — manually add a memory fact
//   PATCH  /api/memories/:id      — edit a memory fact or category
//   DELETE /api/memories/:id      — delete a specific memory

"use strict";

const express = require("express");
const { z } = require("zod");
const authMiddleware = require("../authMiddleware");
const { prisma } = require("../prisma");
const { apiLimiter } = require("../middleware/rateLimits");
const logger = require("../logger");

const router = express.Router();

const VALID_CATEGORIES = ["preference", "expertise", "context", "goal"];

// ── GET /api/memories ─────────────────────────────────────────────────────────

router.get("/api/memories", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { category, query, limit: limitStr, page: pageStr } = req.query;

  const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 50));
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const skip = (page - 1) * limit;

  const where = { userId };
  if (category && VALID_CATEGORIES.includes(category)) where.category = category;
  if (query) where.fact = { contains: query, mode: "insensitive" };

  try {
    const [memories, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.memory.count({ where }),
    ]);

    res.json({
      memories,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error("[Memories] GET /api/memories error:", err.message);
    res.status(500).json({ error: "Failed to fetch memories." });
  }
});

// ── POST /api/memories — Manual memory creation ───────────────────────────────

const CreateMemorySchema = z.object({
  fact: z.string().min(1, "fact must not be empty").max(2000),
  category: z.enum(["preference", "expertise", "context", "goal"]).default("context"),
});

router.post("/api/memories", apiLimiter, authMiddleware, async (req, res) => {
  const result = CreateMemorySchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }

  const userId = req.userId;
  const { fact, category } = result.data;

  try {
    const memory = await prisma.memory.create({
      data: { userId, fact, category, chatId: null },
    });
    res.status(201).json(memory);
  } catch (err) {
    logger.error("[Memories] POST /api/memories error:", err.message);
    res.status(500).json({ error: "Failed to create memory." });
  }
});

// ── PATCH /api/memories/:id ───────────────────────────────────────────────────

const UpdateMemorySchema = z.object({
  fact: z.string().min(1).max(2000).optional(),
  category: z.enum(["preference", "expertise", "context", "goal"]).optional(),
});

router.patch("/api/memories/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const result = UpdateMemorySchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }

  // Ensure memory belongs to this user
  const existing = await prisma.memory.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "Memory not found." });

  try {
    const updated = await prisma.memory.update({
      where: { id },
      data: result.data,
    });
    res.json(updated);
  } catch (err) {
    logger.error("[Memories] PATCH /api/memories/:id error:", err.message);
    res.status(500).json({ error: "Failed to update memory." });
  }
});

// ── DELETE /api/memories/:id ──────────────────────────────────────────────────

router.delete("/api/memories/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const existing = await prisma.memory.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "Memory not found." });

  try {
    await prisma.memory.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    logger.error("[Memories] DELETE /api/memories/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete memory." });
  }
});

module.exports = router;
