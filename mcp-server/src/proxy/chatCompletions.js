// mcp-server/src/proxy/chatCompletions.js
// POST /api/chat/completions — OpenAI-compatible streaming proxy to the rass-engine-service.
// Used by LibreChat and similar OpenAI-API-compatible clients.

const express = require("express");
const axios = require("axios");

const DEFAULT_TOP_K = Number(process.env.MCP_DEFAULT_TOP_K) || 10;

const router = express.Router();

router.post("/api/chat/completions", async (req, res) => {
  const userMessages = req.body.messages.filter((m) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];

  let query;
  if (Array.isArray(lastUserMessage?.content)) {
    query = lastUserMessage.content[0]?.text;
  } else if (typeof lastUserMessage?.content === "string") {
    query = lastUserMessage.content;
  } else {
    query = null;
  }

  console.log(`[LibreChat Proxy] Received query: "${query}"`);

  if (!query) {
    return res.status(400).json({ error: "No user message found in request" });
  }

  try {
    const rassEngineStreamUrl = "http://rass-engine-service:8000/stream-ask";

    const response = await axios.post(
      rassEngineStreamUrl,
      { query: query, top_k: DEFAULT_TOP_K },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    response.data.on("data", (chunk) => {
      console.log("[Proxy → client]", chunk.toString());
    });

    response.data.pipe(res);

    req.on("close", () => {
      console.log("[LibreChat Proxy] Client closed connection.");
      response.data.destroy();
    });
  } catch (e) {
    console.error(
      "[LibreChat Proxy] Error calling RASS engine stream:",
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
