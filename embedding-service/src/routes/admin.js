// embedding-service/src/routes/admin.js
// POST /clear-docstore     — Clears all documents from the active docstore.
// POST /internal/reindex  — Re-queues previously ingested documents from persistent storage.

const express = require("express");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs-extra");
const { InMemoryStore } = require("langchain/storage/in_memory");
const { getDocstore, setDocstore } = require("../clients/redisClient");
const { RedisDocumentStore } = require("../store/redisDocumentStore");
const { ingestionQueue } = require("../queue/ingestionQueue");
const logger = require("../logger");

const UPLOADS_DIR = process.env.UPLOADS_DIR || "./uploads";

const router = express.Router();

router.post("/clear-docstore", async (req, res) => {
  const docstore = getDocstore();

  if (!docstore) {
    return res.status(503).json({ error: "Document store is not initialized." });
  }

  try {
    if (docstore instanceof RedisDocumentStore) {
      const allKeys = await docstore.yieldKeys("");
      if (allKeys.length > 0) {
        await docstore.mdelete(allKeys);
        logger.info(
          `[Admin] Redis docstore cleared: ${allKeys.length} documents deleted.`
        );
      } else {
        logger.info(`[Admin] Redis docstore was already empty.`);
      }
    } else {
      setDocstore(new InMemoryStore());
      logger.info(`[Admin] In-memory docstore reset.`);
    }
    res.status(200).send({ message: "Document store cleared." });
  } catch (error) {
    logger.error("[Admin] Error clearing docstore:", error);
    res.status(500).json({ error: "Failed to clear document store." });
  }
});

// ── POST /internal/reindex — Re-queue documents from persistent storage ───────
//
// Called by mcp-server admin endpoint. Accepts an array of document descriptors
// and re-queues each one whose stored file exists in UPLOADS_DIR.
// Documents whose files are missing are returned in the `failed` list.

router.post("/internal/reindex", async (req, res) => {
  const { documents } = req.body;

  if (!Array.isArray(documents) || documents.length === 0) {
    return res.status(400).json({ error: "documents must be a non-empty array." });
  }

  const queued = [];
  const failed = [];

  for (const doc of documents) {
    const { documentId, originalName, mimeType, fileSizeBytes, userId, kbId, targetIndex, fileType } = doc;

    if (!documentId) {
      failed.push({ documentId, reason: "missing documentId" });
      continue;
    }

    // Reconstruct the stored path: ./uploads/{documentId}.{ext}
    const ext = fileType ? `.${fileType}` : path.extname(originalName || "").toLowerCase();
    const storedPath = path.join(UPLOADS_DIR, `${documentId}${ext}`);

    const exists = await fs.pathExists(storedPath);
    if (!exists) {
      logger.warn(`[Reindex] File not found for document ${documentId}: ${storedPath}`);
      failed.push({ documentId, reason: "file not found" });
      continue;
    }

    try {
      const job = await ingestionQueue.add(
        "ingest",
        {
          filePath: storedPath,
          originalName: originalName || `${documentId}${ext}`,
          mimeType: mimeType || "application/octet-stream",
          fileSizeBytes: fileSizeBytes || 0,
          userId: userId || "system",
          documentId,
          kbId: kbId || null,
          targetIndex: targetIndex || null,
        },
        { jobId: uuidv4() }
      );

      logger.info(`[Reindex] Re-queued document ${documentId} as job ${job.id}`);
      queued.push({ documentId, jobId: job.id });
    } catch (err) {
      logger.error(`[Reindex] Failed to queue document ${documentId}: ${err.message}`);
      failed.push({ documentId, reason: err.message });
    }
  }

  res.json({
    message: `Re-index initiated: ${queued.length} queued, ${failed.length} failed.`,
    queued,
    failed,
  });
});

module.exports = router;
