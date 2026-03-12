// mcp-server/src/routes/apiKeys.js
// Phase D: API key management endpoints (authenticated).
//
// Routes:
//   GET    /api/api-keys          — List current user's API keys (no raw key shown)
//   POST   /api/api-keys          — Create a new API key (raw key shown ONCE)
//   DELETE /api/api-keys/:id      — Revoke an API key

"use strict";

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const authMiddleware = require("../authMiddleware");
const { writeAuditLog } = require("../services/auditService");
const { prisma } = require("../prisma");
const { apiLimiter, deleteLimiter } = require("../middleware/rateLimits");

const router = express.Router();

// ── GET /api/api-keys ─────────────────────────────────────────────────────────

router.get("/api/api-keys", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      select: { id: true, name: true, lastUsed: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(keys);
  } catch (err) {
    console.error("[ApiKeys] Error listing keys:", err.message);
    res.status(500).json({ error: "Failed to list API keys." });
  }
});

// ── POST /api/api-keys ────────────────────────────────────────────────────────

router.post("/api/api-keys", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { name, expiresAt } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "API key name is required." });
  }

  try {
    // Validate expiresAt if provided
    let parsedExpiresAt = null;
    if (expiresAt !== undefined && expiresAt !== null) {
      const ts = Date.parse(expiresAt);
      if (Number.isNaN(ts)) {
        return res.status(400).json({ error: "Invalid 'expiresAt' value; expected a valid ISO-8601 date string." });
      }
      parsedExpiresAt = new Date(ts);
    }

    // Generate a cryptographically secure random key with a recognisable prefix
    const rawKey = `rass_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        name: name.trim(),
        keyHash,
        userId,
        expiresAt: parsedExpiresAt,
      },
      select: { id: true, name: true, expiresAt: true, createdAt: true },
    });

    await writeAuditLog({
      userId,
      action: "API_KEY_CREATED",
      resourceType: "ApiKey",
      resourceId: apiKey.id,
      outcome: "SUCCESS",
      metadata: { name: apiKey.name },
      req,
    });

    // Return the raw key ONLY ONCE — it is not stored and cannot be retrieved again
    res.status(201).json({
      ...apiKey,
      key: rawKey,
      warning: "Store this key securely — it will not be shown again.",
    });
  } catch (err) {
    console.error("[ApiKeys] Error creating key:", err.message);
    res.status(500).json({ error: "Failed to create API key." });
  }
});

// ── DELETE /api/api-keys/:id ──────────────────────────────────────────────────

router.delete("/api/api-keys/:id", deleteLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const key = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!key) return res.status(404).json({ error: "API key not found." });

    await prisma.apiKey.delete({ where: { id } });

    await writeAuditLog({
      userId,
      action: "API_KEY_REVOKED",
      resourceType: "ApiKey",
      resourceId: id,
      outcome: "SUCCESS",
      metadata: { name: key.name },
      req,
    });

    res.json({ message: "API key revoked.", id });
  } catch (err) {
    console.error("[ApiKeys] Error revoking key:", err.message);
    res.status(500).json({ error: "Failed to revoke API key." });
  }
});

module.exports = router;
