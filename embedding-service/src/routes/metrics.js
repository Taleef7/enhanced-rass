// embedding-service/src/routes/metrics.js
// GET /metrics — Prometheus metrics endpoint.
// Protected by METRICS_TOKEN env var (Authorization: Bearer <token>).

"use strict";

const express = require("express");
const { register, ingestionQueueDepth, activeWorkers } = require("../metrics");
const { ingestionQueue } = require("../queue/ingestionQueue");

const router = express.Router();
const METRICS_TOKEN = process.env.METRICS_TOKEN || "";

router.get("/metrics", async (req, res) => {
  if (METRICS_TOKEN) {
    const auth = req.headers["authorization"] || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== METRICS_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    // Update live queue depth gauge before rendering metrics
    const [waiting, active] = await Promise.all([
      ingestionQueue.getWaitingCount(),
      ingestionQueue.getActiveCount(),
    ]);
    ingestionQueueDepth.set({ queue: "ingestion" }, waiting);
    activeWorkers.set(active);

    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

module.exports = router;
