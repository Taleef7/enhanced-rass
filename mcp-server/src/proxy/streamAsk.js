// mcp-server/src/proxy/streamAsk.js
// POST /api/stream-ask — Authenticated SSE proxy to the rass-engine-service.
// Phase 2.1: Fetches the last 8 chat messages (if chatId is provided) and passes
// them as conversationHistory so QueryReformulationStage can reformulate follow-up questions.

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { RASS_ENGINE_BASE_URL } = require("../config");
const { validateBody } = require("../middleware/validate");
const { StreamAskBodySchema } = require("../schemas/streamAskSchema");
const { queryLatencySeconds, llmApiErrorsTotal } = require("../metrics");
const { prisma } = require("../prisma");

const router = express.Router();

router.post("/api/stream-ask", authMiddleware, validateBody(StreamAskBodySchema), async (req, res) => {
  const { query, documents, kbId, chatId } = req.validatedBody;
  const userId = req.userId;

  req.log.info(`[Stream Proxy] Query from user: ${userId}`);

  // Phase 2.1: Fetch recent conversation history for query reformulation.
  // This runs before the SSE stream starts so it doesn't block streaming.
  let conversationHistory = [];
  if (chatId) {
    try {
      const chat = await prisma.chat.findFirst({
        where: { id: chatId, userId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (chat?.messages?.length > 0) {
        // Take the last 8 messages (excluding the current query, which hasn't been saved yet)
        conversationHistory = chat.messages
          .slice(-8)
          .map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text || "",
          }))
          .filter((m) => m.content.trim().length > 0);
        req.log.info(`[Stream Proxy] Loaded ${conversationHistory.length} history messages for query reformulation.`);
      }
    } catch (historyErr) {
      // Non-fatal — reformulation will be skipped if history is unavailable
      req.log.warn(`[Stream Proxy] Could not fetch conversation history: ${historyErr.message}`);
    }
  }

  const startTime = Date.now();

  try {
    const rassEngineStreamUrl = `${RASS_ENGINE_BASE_URL}/stream-ask`;

    const response = await axios.post(
      rassEngineStreamUrl,
      { query, documents, userId, kbId, conversationHistory },
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
