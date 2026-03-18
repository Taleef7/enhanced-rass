// mcp-server/src/routes/llmKeys.js
// Phase 5.2: Per-user LLM provider API key management.
//
// Allows users to store their own OpenAI / Gemini / Cohere API keys so the
// /v1/chat/completions endpoint uses their personal quota instead of the system key.
// Keys are encrypted at rest with AES-256-GCM using the ENCRYPTION_KEY env var.
//
// Routes (all require JWT auth):
//   GET    /api/llm-keys              — list stored providers (no raw key shown)
//   PUT    /api/llm-keys/:provider    — store or update a provider key
//   DELETE /api/llm-keys/:provider    — remove a provider key
//
// Supported providers: openai | gemini | cohere | anthropic

"use strict";

const express = require("express");
const crypto = require("crypto");
const authMiddleware = require("../authMiddleware");
const { prisma } = require("../prisma");
const { apiLimiter, deleteLimiter } = require("../middleware/rateLimits");
const logger = require("../logger");

const router = express.Router();

const SUPPORTED_PROVIDERS = new Set(["openai", "gemini", "cohere", "anthropic"]);

// ── Encryption helpers ────────────────────────────────────────────────────────
// AES-256-GCM: authenticated encryption that prevents tampering.
// ENCRYPTION_KEY must be a 64-character hex string (32 bytes).

const DEV_FALLBACK_KEY = "0".repeat(64); // only used when env var is missing in dev

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[LlmKeys] ENCRYPTION_KEY must be set in production.");
    }
    logger.warn("[LlmKeys] ENCRYPTION_KEY not set — using insecure dev key. Set it in .env for production.");
    return Buffer.from(DEV_FALLBACK_KEY, "hex");
  }
  if (key.length !== 64) {
    throw new Error("[LlmKeys] ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
  }
  return Buffer.from(key, "hex");
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    keyIv: iv.toString("hex"),
    keyTag: tag.toString("hex"),
    keyCipher: encrypted.toString("hex"),
  };
}

function decrypt({ keyIv, keyTag, keyCipher }) {
  const key = getEncryptionKey();
  const iv = Buffer.from(keyIv, "hex");
  const tag = Buffer.from(keyTag, "hex");
  const ciphertext = Buffer.from(keyCipher, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── GET /api/llm-keys ─────────────────────────────────────────────────────────
// Returns list of providers for which the user has stored a key.
// Raw keys are NEVER returned — only provider name and timestamps.

router.get("/api/llm-keys", apiLimiter, authMiddleware, async (req, res) => {
  try {
    const keys = await prisma.userLlmKey.findMany({
      where: { userId: req.userId },
      select: { id: true, provider: true, createdAt: true, updatedAt: true },
      orderBy: { provider: "asc" },
    });
    res.json(keys);
  } catch (err) {
    logger.error("[LlmKeys] Error listing keys:", err.message);
    res.status(500).json({ error: "Failed to list LLM keys." });
  }
});

// ── PUT /api/llm-keys/:provider ───────────────────────────────────────────────
// Store or update an API key for a specific provider.
// Body: { key: "sk-..." }

router.put("/api/llm-keys/:provider", apiLimiter, authMiddleware, async (req, res) => {
  const { provider } = req.params;
  const { key: rawKey } = req.body;

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return res.status(400).json({
      error: `Unsupported provider "${provider}". Supported: ${[...SUPPORTED_PROVIDERS].join(", ")}`,
    });
  }

  if (!rawKey || typeof rawKey !== "string" || rawKey.trim().length < 10) {
    return res.status(400).json({ error: "key must be a non-empty API key string." });
  }

  try {
    const { keyIv, keyTag, keyCipher } = encrypt(rawKey.trim());

    const record = await prisma.userLlmKey.upsert({
      where: { userId_provider: { userId: req.userId, provider } },
      update: { keyIv, keyTag, keyCipher },
      create: { userId: req.userId, provider, keyIv, keyTag, keyCipher },
      select: { id: true, provider: true, createdAt: true, updatedAt: true },
    });

    logger.info(`[LlmKeys] User ${req.userId} stored key for provider: ${provider}`);
    res.json({ ...record, message: `API key for ${provider} stored successfully.` });
  } catch (err) {
    logger.error("[LlmKeys] Error storing key:", err.message);
    res.status(500).json({ error: "Failed to store LLM key." });
  }
});

// ── DELETE /api/llm-keys/:provider ───────────────────────────────────────────

router.delete("/api/llm-keys/:provider", deleteLimiter, authMiddleware, async (req, res) => {
  const { provider } = req.params;

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  }

  try {
    const existing = await prisma.userLlmKey.findUnique({
      where: { userId_provider: { userId: req.userId, provider } },
    });
    if (!existing) {
      return res.status(404).json({ error: `No stored key for provider: ${provider}` });
    }

    await prisma.userLlmKey.delete({
      where: { userId_provider: { userId: req.userId, provider } },
    });

    logger.info(`[LlmKeys] User ${req.userId} deleted key for provider: ${provider}`);
    res.json({ message: `API key for ${provider} removed.` });
  } catch (err) {
    logger.error("[LlmKeys] Error deleting key:", err.message);
    res.status(500).json({ error: "Failed to delete LLM key." });
  }
});

// ── Helper: resolve a user's effective API key for a provider ─────────────────
// Called by openaiCompat.js to get per-user key with system key fallback.

async function resolveUserLlmKey(userId, provider) {
  if (!userId || !SUPPORTED_PROVIDERS.has(provider)) return null;
  try {
    const record = await prisma.userLlmKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!record) return null;
    return decrypt(record);
  } catch (err) {
    logger.warn(`[LlmKeys] Failed to decrypt key for userId=${userId} provider=${provider}: ${err.message}`);
    return null;
  }
}

module.exports = router;
module.exports.resolveUserLlmKey = resolveUserLlmKey;
