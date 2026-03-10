// mcp-server/src/routes/documents.js
// Document registry management endpoints (authenticated).
//
// Routes:
//   GET    /api/documents          — Paginated list of current user's documents
//   GET    /api/documents/:id      — Single document metadata
//   DELETE /api/documents/:id      — Soft-delete document, remove vectors + parents
//   GET    /api/documents/:id/provenance — Document ETL provenance record
//   POST   /api/documents          — Create a Document registry entry (called by upload proxy)

"use strict";

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { writeAuditLog } = require("../services/auditService");
const { prisma } = require("../prisma");
const { OPENSEARCH_HOST, OPENSEARCH_PORT, EMBEDDING_SERVICE_BASE_URL } = require("../config");
const { apiLimiter, deleteLimiter, uploadLimiter } = require("../middleware/rateLimits");

const router = express.Router();

// ── GET /api/documents ────────────────────────────────────────────────────────

router.get("/api/documents", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const VALID_STATUSES = ["QUEUED", "PROCESSING", "READY", "FAILED", "DELETED"];
  const statusParam = req.query.status || undefined;

  if (statusParam && !VALID_STATUSES.includes(statusParam)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
    });
  }

  try {
    const where = {
      userId,
      status: statusParam ? { equals: statusParam } : { not: "DELETED" },
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          fileSizeBytes: true,
          status: true,
          chunkCount: true,
          errorMessage: true,
          openSearchIndex: true,
          kbId: true,
          uploadedAt: true,
          processedAt: true,
        },
      }),
      prisma.document.count({ where }),
    ]);

    res.json({
      documents,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[Documents] Error listing documents:", err.message);
    res.status(500).json({ error: "Failed to fetch documents." });
  }
});

// ── GET /api/documents/:id ────────────────────────────────────────────────────

router.get("/api/documents/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const doc = await prisma.document.findFirst({
      where: { id, userId },
      include: { provenance: true },
    });

    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    res.json(doc);
  } catch (err) {
    console.error("[Documents] Error fetching document:", err.message);
    res.status(500).json({ error: "Failed to fetch document." });
  }
});

// ── GET /api/documents/:id/provenance ─────────────────────────────────────────

router.get("/api/documents/:id/provenance", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    const provenance = await prisma.documentProvenance.findUnique({
      where: { documentId: id },
    });

    if (!provenance) {
      return res.status(404).json({ error: "Provenance record not yet available." });
    }

    res.json(provenance);
  } catch (err) {
    console.error("[Documents] Error fetching provenance:", err.message);
    res.status(500).json({ error: "Failed to fetch provenance." });
  }
});

// ── DELETE /api/documents/:id ─────────────────────────────────────────────────
// Soft-deletes the document record and performs a best-effort removal of its
// child vectors from OpenSearch. Parent chunks stored in Redis are NOT explicitly
// cleaned up here — they remain until natural TTL expiry or a future admin cleanup
// job. This is a known limitation; avoid storing sensitive data in parent chunks.

router.delete("/api/documents/:id", deleteLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }
    if (doc.status === "DELETED") {
      return res.status(409).json({ error: "Document is already deleted." });
    }

    const indexName = doc.openSearchIndex || "knowledge_base";

    // 1. Remove OpenSearch vectors for this document
    try {
      const openSearchUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;
      await axios.post(
        `${openSearchUrl}/${indexName}/_delete_by_query`,
        {
          query: { term: { "metadata.documentId": id } },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );
      console.log(`[Documents] Deleted OpenSearch vectors for document ${id}`);
    } catch (osErr) {
      console.warn(`[Documents] Could not remove OpenSearch vectors: ${osErr.message}`);
    }

    // 2. Mark document as DELETED in DB
    await prisma.document.update({
      where: { id },
      data: { status: "DELETED", deletedAt: new Date() },
    });

    await writeAuditLog({
      userId,
      action: "DOCUMENT_DELETED",
      resource: id,
      outcome: "SUCCESS",
      metadata: { originalFilename: doc.originalFilename },
    });

    console.log(`[Documents] Document ${id} marked as DELETED`);
    res.json({ message: "Document deleted successfully.", id });
  } catch (err) {
    console.error("[Documents] Error deleting document:", err.message);
    res.status(500).json({ error: "Failed to delete document." });
  }
});

// ── POST /api/documents ───────────────────────────────────────────────────────
// Called by the upload proxy to register a document before enqueuing ingestion.

router.post("/api/documents", uploadLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { originalFilename, mimeType, fileSizeBytes, kbId, ingestionJobId, openSearchIndex } = req.body;

  if (!originalFilename || !mimeType || !fileSizeBytes) {
    return res.status(400).json({ error: "originalFilename, mimeType, and fileSizeBytes are required." });
  }

  try {
    const doc = await prisma.document.create({
      data: {
        userId,
        originalFilename,
        mimeType,
        fileSizeBytes,
        status: "QUEUED",
        kbId: kbId || null,
        ingestionJobId: ingestionJobId || null,
        openSearchIndex: openSearchIndex || "knowledge_base",
      },
    });

    await writeAuditLog({
      userId,
      action: "DOCUMENT_UPLOADED",
      resource: doc.id,
      outcome: "SUCCESS",
      metadata: { originalFilename, mimeType, fileSizeBytes },
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error("[Documents] Error creating document:", err.message);
    res.status(500).json({ error: "Failed to register document." });
  }
});

module.exports = router;
