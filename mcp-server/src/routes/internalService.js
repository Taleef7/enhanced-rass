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

module.exports = router;
