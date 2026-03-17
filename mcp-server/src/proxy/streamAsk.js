// mcp-server/src/proxy/streamAsk.js
// POST /api/stream-ask — Authenticated SSE proxy to the rass-engine-service.

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { RASS_ENGINE_BASE_URL } = require("../config");
const { validateBody } = require("../middleware/validate");
const { StreamAskBodySchema } = require("../schemas/streamAskSchema");
const { queryLatencySeconds, llmApiErrorsTotal } = require("../metrics");

const router = express.Router();

router.post("/api/stream-ask", authMiddleware, validateBody(StreamAskBodySchema), async (req, res) => {
  const { query, documents, kbId } = req.validatedBody;
  const userId = req.userId;

  req.log.info(`[Stream Proxy] Query from user: ${userId}`);

  const startTime = Date.now();

  try {
    const rassEngineStreamUrl = `${RASS_ENGINE_BASE_URL}/stream-ask`;

    const response = await axios.post(
      rassEngineStreamUrl,
      { query, documents, userId, kbId },
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

    response.data.on("end", () => {
      queryLatencySeconds.observe({ stage: "end_to_end" }, (Date.now() - startTime) / 1000);
    });

    req.on("close", () => {
      req.log.info("[Stream Proxy] Client closed connection.");
      response.data.destroy();
    });
  } catch (e) {
    req.log.error({ err: e }, "[Stream Proxy] Error calling RASS engine stream.");
    llmApiErrorsTotal.inc({ provider: "rass-engine" });
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
