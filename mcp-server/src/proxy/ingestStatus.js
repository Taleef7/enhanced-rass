"use strict";

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { EMBEDDING_SERVICE_BASE_URL } = require("../config");
const { statusPollLimiter } = require("../middleware/rateLimits");

const router = express.Router();

router.get("/api/ingest/status/:jobId", statusPollLimiter, authMiddleware, async (req, res) => {
  const { jobId } = req.params;

  try {
    const response = await axios.get(
      `${EMBEDDING_SERVICE_BASE_URL}/ingest/status/${jobId}`,
      { timeout: 10000 }
    );
    res.json(response.data);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: `Job ${jobId} not found.` });
    }
    console.error("[IngestStatus Proxy] Error:", err.message);
    res.status(500).json({ error: "Failed to retrieve job status." });
  }
});

module.exports = router;
