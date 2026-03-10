// mcp-server/src/proxy/embedUpload.js
// POST /api/embed-upload — Authenticated file upload handler:
// 1. Creates a Document registry entry in Postgres (status: QUEUED)
// 2. Proxies the file + documentId to the embedding-service for async ingestion
// 3. Returns 202 Accepted with { jobId, documentId, status: "queued" }

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const authMiddleware = require("../authMiddleware");
const { writeAuditLog } = require("../services/auditService");
const { EMBEDDING_SERVICE_BASE_URL } = require("../config");

const storage = multer.memoryStorage();
const upload = multer({ storage });
const prisma = new PrismaClient();

const router = express.Router();

router.post(
  "/api/embed-upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const userId = req.user.userId;
    const kbId = req.body.kbId || null;
    const chunkingStrategy = req.body.chunkingStrategy || null;

    console.log(`[Upload Proxy] Received file: ${req.file.originalname} from user: ${userId}`);

    // 1. Create Document registry entry
    let doc;
    try {
      doc = await prisma.document.create({
        data: {
          userId,
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
          status: "QUEUED",
          kbId: kbId || null,
        },
      });
    } catch (dbErr) {
      console.error("[Upload Proxy] Failed to create document registry entry:", dbErr.message);
      return res.status(500).json({ error: "Failed to register document." });
    }

    // 2. Forward to embedding-service for async ingestion
    try {
      const form = new FormData();
      form.append("files", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
      form.append("userId", userId);
      form.append("documentId", doc.id);
      if (kbId) form.append("kbId", kbId);
      if (chunkingStrategy) form.append("chunkingStrategy", chunkingStrategy);

      const embeddingServiceUrl = `${EMBEDDING_SERVICE_BASE_URL}/upload`;
      const response = await axios.post(embeddingServiceUrl, form, {
        headers: { ...form.getHeaders() },
        timeout: process.env.EMBEDDING_SERVICE_TIMEOUT || 30000,
      });

      // Update document with the job ID returned by the embedding-service
      const firstJob = response.data?.jobs?.[0];
      if (firstJob?.jobId) {
        await prisma.document.update({
          where: { id: doc.id },
          data: { ingestionJobId: String(firstJob.jobId) },
        }).catch((err) => console.warn('[Upload Proxy] Could not update ingestionJobId:', err.message));
      }

      await writeAuditLog({
        userId,
        action: "DOCUMENT_UPLOADED",
        resource: doc.id,
        outcome: "SUCCESS",
        metadata: { originalFilename: req.file.originalname, jobId: firstJob?.jobId },
      });

      console.log("[Upload Proxy] File forwarded to embedding-service successfully.");

      // Return 202 with combined document + job info
      res.status(202).json({
        documentId: doc.id,
        ...response.data,
      });
    } catch (e) {
      console.error("[Upload Proxy] Error forwarding file to embedding-service:", e.message);

      // Rollback document status to FAILED
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: "FAILED", errorMessage: e.message },
      }).catch(() => {});

      res.status(500).json({
        error: "Failed to upload and embed file.",
        details: e.message,
      });
    }
  }
);

module.exports = router;
