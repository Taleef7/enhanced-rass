// embedding-service/src/routes/upload.js
// POST /upload — Accepts a file, writes it to disk, enqueues an async ingestion job,
// and immediately returns HTTP 202 with { jobId, documentId, status: "queued" }.
// Actual ingestion (parse → chunk → embed → index) is handled by ingestionWorker.js.

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");

const { ingestionQueue } = require("../queue/ingestionQueue");
const { validateBody } = require("../middleware/validate");
const { UploadBodySchema } = require("../schemas/uploadSchema");

// Persist uploaded files to disk so the async worker can access them.
fs.ensureDirSync("./temp");
const storage = multer.diskStorage({
  destination: "./temp",
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});
const upload = multer({ storage });

const router = express.Router();

router.post(
  "/upload",
  upload.array("files"),
  validateBody(UploadBodySchema),
  async (req, res) => {
    const files = req.files;
    const { userId } = req.validatedBody;
    const kbId = req.body.kbId || null;
    // documentId may be pre-assigned by the mcp-server upload proxy
    const preassignedDocumentId = req.body.documentId || null;
    const chunkingStrategyOverride = req.body.chunkingStrategy || null;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded." });
    }

    console.log(
      `[Upload] Received ${files.length} file(s) from user: ${userId}`
    );

    try {
      const jobs = [];

      for (const file of files) {
        // Use pre-assigned documentId from mcp-server, or generate a new one
        const documentId = preassignedDocumentId || uuidv4();

        const job = await ingestionQueue.add(
          "ingest",
          {
            filePath: file.path,
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSizeBytes: file.size,
            userId,
            documentId,
            kbId,
            chunkingStrategyOverride,
          },
          { jobId: uuidv4() }
        );

        console.log(
          `[Upload] Enqueued job ${job.id} for file: ${file.originalname} (doc: ${documentId})`
        );

        jobs.push({
          jobId: job.id,
          documentId,
          originalName: file.originalname,
          status: "queued",
        });
      }

      // Return 202 Accepted with job identifiers — client should poll /ingest/status/:jobId
      res.status(202).json({
        message: "Files accepted for ingestion.",
        jobs,
      });
    } catch (error) {
      console.error("[Upload] Error enqueuing ingestion job:", error);

      // Clean up temp files if enqueue failed
      for (const file of files) {
        fs.unlink(file.path).catch(() => {});
      }

      res.status(500).json({ error: "Failed to enqueue ingestion job." });
    }
  }
);

module.exports = router;
