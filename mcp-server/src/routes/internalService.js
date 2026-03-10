// mcp-server/src/routes/internalService.js
// Internal service-to-service routes (NOT authenticated with JWT).
// These routes are called only by other backend services (e.g. embedding-service worker)
// and are expected to be isolated from the public internet by Docker networking.
//
// Routes:
//   PATCH  /internal/documents/:id/status   — Update document lifecycle status
//   POST   /internal/documents/:id/provenance — Persist ETL provenance record
//   POST   /internal/audit                  — Write an audit log entry

"use strict";

const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { writeAuditLog } = require("../services/auditService");

const prisma = new PrismaClient();
const router = express.Router();

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

    console.log(`[Internal] Document ${id} status → ${status}`);
    res.json({ id: doc.id, status: doc.status });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: `Document ${id} not found.` });
    }
    console.error("[Internal] Error updating document status:", err.message);
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

    console.log(`[Internal] Provenance created for document ${documentId}`);
    res.status(201).json(provenance);
  } catch (err) {
    console.error("[Internal] Error creating provenance:", err.message);
    res.status(500).json({ error: "Failed to create provenance record." });
  }
});

// ── POST /internal/audit ──────────────────────────────────────────────────────

router.post("/internal/audit", async (req, res) => {
  const { userId, action, resource, outcome, metadata } = req.body;
  await writeAuditLog({ userId, action, resource, outcome, metadata });
  res.status(201).json({ ok: true });
});

module.exports = router;
