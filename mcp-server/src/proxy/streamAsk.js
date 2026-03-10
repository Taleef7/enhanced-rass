// mcp-server/src/proxy/streamAsk.js
// POST /api/stream-ask — Authenticated SSE proxy to the rass-engine-service.

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");

const router = express.Router();

router.post("/api/stream-ask", authMiddleware, async (req, res) => {
  const { query, documents } = req.body;
  const userId = req.userId;

  console.log(`[Stream Proxy] Query from user: ${userId}`);

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const rassEngineStreamUrl = "http://rass-engine-service:8000/stream-ask";

    const response = await axios.post(
      rassEngineStreamUrl,
      { query, documents, userId },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    response.data.pipe(res);

    req.on("close", () => {
      console.log("[Stream Proxy] Client closed connection.");
      response.data.destroy();
    });
  } catch (e) {
    console.error(
      "[Stream Proxy] Error calling RASS engine stream:",
      e.message
    );
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "Failed to process stream in RASS engine." });
    } else {
      res.end();
    }
  }
});

module.exports = router;
