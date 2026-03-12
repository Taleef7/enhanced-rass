// embedding-service/src/routes/ingestStatus.js
// GET /ingest/status/:jobId — Returns the current status, progress, and result of
// an async ingestion job identified by its BullMQ job ID.

"use strict";

const express = require("express");
const { ingestionQueue } = require("../queue/ingestionQueue");
const logger = require("../logger");

const router = express.Router();

router.get("/ingest/status/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await ingestionQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: `Job ${jobId} not found.` });
    }

    const state = await job.getState(); // waiting | active | completed | failed | delayed
    const progress = job.progress || 0;
    const failedReason = job.failedReason || null;
    const finishedOn = job.finishedOn
      ? new Date(job.finishedOn).toISOString()
      : null;
    const returnValue = job.returnvalue || null;

    res.json({
      jobId,
      status: state,
      progress,
      error: failedReason,
      completedAt: finishedOn,
      result: returnValue,
      data: {
        originalName: job.data?.originalName,
        documentId: job.data?.documentId,
      },
    });
  } catch (err) {
    logger.error(`[IngestStatus] Error fetching job ${jobId}:`, err.message);
    res.status(500).json({ error: "Failed to retrieve job status." });
  }
});

module.exports = router;
