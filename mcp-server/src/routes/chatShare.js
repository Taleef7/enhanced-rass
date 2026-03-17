// mcp-server/src/routes/chatShare.js
// Phase G #138: Shareable chat session links.
//
// Routes:
//   POST /api/chats/:chatId/share     — Generate a shareable link for a chat session
//   GET  /api/shared/:token           — Public read-only view of a shared chat

"use strict";

const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const authMiddleware = require("../authMiddleware");
const { prisma } = require("../prisma");
const { apiLimiter } = require("../middleware/rateLimits");
const logger = require("../logger");

const router = express.Router();

// ── POST /api/chats/:chatId/share ─────────────────────────────────────────────

const ShareRequestSchema = z.object({
  expiresInDays: z.number().int().positive().max(365).optional().default(7),
});

router.post(
  "/api/chats/:chatId/share",
  apiLimiter,
  authMiddleware,
  async (req, res) => {
    const { chatId } = req.params;
    const userId = req.userId;

    const parse = ShareRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid share request", details: parse.error.issues });
    }
    const { expiresInDays } = parse.data;

    try {
      // Verify the user owns the chat
      const chat = await prisma.chat.findFirst({
        where: { id: chatId, userId },
      });
      if (!chat) return res.status(404).json({ error: "Chat not found." });

      // Check if an existing non-expired share exists
      const existingShare = await prisma.sharedChat.findFirst({
        where: {
          chatId,
          userId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      if (existingShare) {
        const shareUrl = buildShareUrl(existingShare.token, req);
        return res.json({ token: existingShare.token, url: shareUrl, expiresAt: existingShare.expiresAt });
      }

      // Create a new share token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

      const share = await prisma.sharedChat.create({
        data: { chatId, userId, token, expiresAt },
      });

      logger.info(`[Share] Created shareable link for chat ${chatId} (expires: ${expiresAt.toISOString()})`);

      const shareUrl = buildShareUrl(token, req);
      res.status(201).json({ token: share.token, url: shareUrl, expiresAt: share.expiresAt });
    } catch (err) {
      logger.error("[Share] Failed to create share:", err.message);
      res.status(500).json({ error: "Failed to create share link." });
    }
  }
);

// ── DELETE /api/chats/:chatId/share ──────────────────────────────────────────

router.delete(
  "/api/chats/:chatId/share",
  apiLimiter,
  authMiddleware,
  async (req, res) => {
    const { chatId } = req.params;
    const userId = req.userId;

    try {
      const deleted = await prisma.sharedChat.deleteMany({
        where: { chatId, userId },
      });

      res.json({ message: `Revoked ${deleted.count} share link(s).` });
    } catch (err) {
      logger.error("[Share] Failed to revoke share:", err.message);
      res.status(500).json({ error: "Failed to revoke share link." });
    }
  }
);

// ── GET /api/shared/:token ────────────────────────────────────────────────────

router.get("/api/shared/:token", apiLimiter, async (req, res) => {
  const { token } = req.params;

  try {
    const share = await prisma.sharedChat.findUnique({
      where: { token },
      include: {
        Chat: {
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                sender: true,
                text: true,
                createdAt: true,
              },
            },
          },
        },
        User: { select: { username: true } },
      },
    });

    if (!share) return res.status(404).json({ error: "Share link not found." });

    // Check expiry
    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: "This share link has expired." });
    }

    res.json({
      chatId: share.chatId,
      title: share.Chat.title,
      owner: share.User.username,
      createdAt: share.Chat.createdAt,
      messages: share.Chat.messages,
    });
  } catch (err) {
    logger.error("[Share] Failed to fetch shared chat:", err.message);
    res.status(500).json({ error: "Failed to fetch shared chat." });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────

function buildShareUrl(token, req) {
  const baseUrl =
    process.env.APP_BASE_URL ||
    req.get("origin") ||
    req.get("referer")?.replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/shared/${token}`;
}

module.exports = router;
