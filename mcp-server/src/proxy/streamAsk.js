// mcp-server/src/proxy/streamAsk.js
// POST /api/stream-ask — Authenticated SSE proxy to the rass-engine-service.

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { RASS_ENGINE_BASE_URL } = require("../config");
const { validateBody } = require("../middleware/validate");
const { StreamAskBodySchema } = require("../schemas/streamAskSchema");
const logger = require("../logger");

const router = express.Router();

router.post("/api/stream-ask", authMiddleware, validateBody(StreamAskBodySchema), async (req, res) => {
  const { query, documents } = req.validatedBody;
  const userId = req.userId;

  logger.info(`[Stream Proxy] Query from user: ${userId}`);

  try {
    const rassEngineStreamUrl = `${RASS_ENGINE_BASE_URL}/stream-ask`;

    const response = await axios.post(
      rassEngineStreamUrl,
      { query, documents, userId },
      {
        responseType: "stream",
        headers: { "x-correlation-id": req.correlationId },
      }
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    response.data.pipe(res);

    req.on("close", () => {
      logger.info("[Stream Proxy] Client closed connection.");
      response.data.destroy();
    });
  } catch (e) {
    logger.error(
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
