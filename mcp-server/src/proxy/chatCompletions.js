// mcp-server/src/proxy/chatCompletions.js
// POST /api/chat/completions — OpenAI-compatible streaming proxy to the rass-engine-service.
// Used by LibreChat and similar OpenAI-API-compatible clients.
//
// Note: This endpoint is for the LibreChat integration which has its own auth system
// separate from CoRAG JWTs. Calls are forwarded without a userId so simpleSearch runs
// unscoped (searches all documents in the knowledge base).

const express = require("express");
const axios = require("axios");
const { RASS_ENGINE_BASE_URL } = require("../config");
const { validateBody } = require("../middleware/validate");
const { ChatCompletionsBodySchema } = require("../schemas/chatCompletionsSchema");
const logger = require("../logger");

const DEFAULT_TOP_K = Number(process.env.MCP_DEFAULT_TOP_K) || 10;

const router = express.Router();

router.post("/api/chat/completions", validateBody(ChatCompletionsBodySchema), async (req, res) => {
  const { messages } = req.validatedBody;
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];

  let query;
  if (Array.isArray(lastUserMessage?.content)) {
    query = lastUserMessage.content[0]?.text;
  } else if (typeof lastUserMessage?.content === "string") {
    query = lastUserMessage.content;
  } else {
    query = null;
  }

  logger.info(`[LibreChat Proxy] Received query: "${query}"`);

  if (!query) {
    return res.status(400).json({ error: "No user message found in request" });
  }

  try {
    const rassEngineStreamUrl = `${RASS_ENGINE_BASE_URL}/stream-ask`;

    const response = await axios.post(
      rassEngineStreamUrl,
      { query, top_k: DEFAULT_TOP_K },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    response.data.pipe(res);

    req.on("close", () => {
      logger.info("[LibreChat Proxy] Client closed connection.");
      response.data.destroy();
    });
  } catch (e) {
    logger.error(
      "[LibreChat Proxy] Error calling CoRAG engine stream:",
      e.message
    );
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "Failed to process stream in CoRAG engine." });
    } else {
      res.end();
    }
  }
});

module.exports = router;
