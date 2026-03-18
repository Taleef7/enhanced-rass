// mcp-server/src/routes/openaiCompat.js
// Phase 5.1: OpenAI-compatible /v1/chat/completions endpoint.
//
// Enables OpenWebUI and any OpenAI-API-compatible client to use RASS as a backend.
// Maps the OpenAI chat completions request format to the RASS stream-ask pipeline.
//
// Request → RASS mapping:
//   messages[-1] (user role)      → query
//   messages[0..-2]               → conversationHistory for QueryReformulationStage
//   model "rass-*"                → accepted (routing is config-driven in rass-engine)
//   stream: true/false            → RASS always streams; we buffer for non-streaming
//   top_k                         → passed directly
//   X-KB-ID / x-kb-id header      → kbId for per-KB index routing
//
// Authentication:
//   Accepts RASS JWT Bearer token  OR  API key (x-api-key header).
//   If neither is present: unauthenticated (searches global index, no per-user filtering).
//
// Response format:
//   RASS already emits OpenAI-compatible SSE (chat.completion.chunk objects),
//   so we pipe the rass-engine stream directly with no translation required.
//   For non-streaming requests we buffer all chunks and return a single object.

"use strict";

const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { RASS_ENGINE_BASE_URL } = require("../config");
const logger = require("../logger");

const router = express.Router();

const DEFAULT_TOP_K = Number(process.env.OPENAI_COMPAT_DEFAULT_TOP_K) || 10;

// ── Model registry ─────────────────────────────────────────────────────────────
// Maps display model names to rass-engine accepted identifiers.
// Actual LLM routing is config-driven in rass-engine; these are pass-through.
const SUPPORTED_MODELS = new Set([
  "rass",
  "rass-gpt4o",
  "rass-gemini",
  "rass-local",
  "rass-gpt-4o-mini",
  "rass-gemini-pro",
]);

// ── Lightweight auth: extract userId from JWT or API key (best-effort) ─────────
// Falls back to null if unauthenticated (global search, no personalization).
function extractUserId(req) {
  try {
    // JWT Bearer token: decode the payload without verification
    // (verification already happens in authMiddleware when called explicitly)
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        return payload.userId || payload.sub || null;
      }
    }
  } catch (_) {
    // Ignore decode errors
  }
  return null;
}

// ── GET /v1/models — returns RASS model list ───────────────────────────────────
// Required by OpenWebUI model discovery.

router.get("/v1/models", (req, res) => {
  const models = [...SUPPORTED_MODELS].map((id) => ({
    id,
    object: "model",
    created: 1704067200, // 2024-01-01
    owned_by: "rass",
  }));
  res.json({ object: "list", data: models });
});

// ── POST /v1/chat/completions ─────────────────────────────────────────────────

router.post("/v1/chat/completions", async (req, res) => {
  const { model, messages, stream = true, top_k } = req.body;

  // Validate messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: { message: "messages must be a non-empty array", type: "invalid_request_error" },
    });
  }

  // Extract the last user message as the query
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) {
    return res.status(400).json({
      error: { message: "No user message found in messages array", type: "invalid_request_error" },
    });
  }

  const query =
    typeof lastUserMsg.content === "string"
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg.content)
      ? lastUserMsg.content.map((c) => (c.type === "text" ? c.text : "")).join("")
      : "";

  if (!query.trim()) {
    return res.status(400).json({
      error: { message: "query must not be empty", type: "invalid_request_error" },
    });
  }

  // Build conversation history from all messages EXCEPT the last user message
  const historyMessages = messages.slice(0, messages.lastIndexOf(lastUserMsg));
  const conversationHistory = historyMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : (m.content?.[0]?.text || ""),
    }));

  // Optional per-KB routing via header
  const kbId = req.headers["x-kb-id"] || req.headers["x-knowledge-base-id"] || null;

  const userId = extractUserId(req);
  const topK = Number(top_k) > 0 ? Number(top_k) : DEFAULT_TOP_K;

  logger.info(
    `[OpenAICompat] model=${model || "rass"} userId=${userId || "anon"} kbId=${kbId || "default"} query="${query.slice(0, 60)}"`
  );

  const streamAskPayload = {
    query,
    top_k: topK,
    userId: userId || undefined,
    kbId: kbId || undefined,
    conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
  };

  if (stream !== false) {
    // ── Streaming response ──────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const rassResponse = await axios.post(
        `${RASS_ENGINE_BASE_URL}/stream-ask`,
        streamAskPayload,
        { responseType: "stream", timeout: 120000 }
      );

      rassResponse.data.pipe(res);

      req.on("close", () => {
        logger.info("[OpenAICompat] Client disconnected — aborting RASS stream.");
        rassResponse.data.destroy();
      });
    } catch (err) {
      logger.error("[OpenAICompat] RASS stream error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: { message: "RASS engine unavailable", type: "server_error" } });
      } else {
        // Send an error delta then terminate the stream
        const errChunk = JSON.stringify({
          id: `chatcmpl-${uuidv4()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: model || "rass",
          choices: [{ index: 0, delta: { content: "\n[Error: RASS engine failed]" }, finish_reason: "stop" }],
        });
        res.write(`data: ${errChunk}\n\ndata: [DONE]\n\n`);
        res.end();
      }
    }
  } else {
    // ── Non-streaming: buffer the entire RASS stream and return a single object ──
    try {
      const rassResponse = await axios.post(
        `${RASS_ENGINE_BASE_URL}/stream-ask`,
        streamAskPayload,
        { responseType: "stream", timeout: 120000 }
      );

      let fullContent = "";
      let citationsData = null;

      await new Promise((resolve, reject) => {
        rassResponse.data.on("data", (chunk) => {
          const lines = chunk.toString().split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") return;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
              }
              if (delta?.custom_meta?.type === "citations") {
                citationsData = delta.custom_meta.citations;
              }
            } catch (_) {
              // Ignore parse errors on individual SSE lines
            }
          }
        });
        rassResponse.data.on("end", resolve);
        rassResponse.data.on("error", reject);
      });

      const completionId = `chatcmpl-${uuidv4()}`;
      const response = {
        id: completionId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model || "rass",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: fullContent },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: -1,   // RASS doesn't track token counts at this layer
          completion_tokens: -1,
          total_tokens: -1,
        },
      };

      // Attach citations as a custom extension if available
      if (citationsData) {
        response.rass_citations = citationsData;
      }

      res.json(response);
    } catch (err) {
      logger.error("[OpenAICompat] Non-streaming RASS error:", err.message);
      res.status(502).json({ error: { message: "RASS engine unavailable", type: "server_error" } });
    }
  }
});

module.exports = router;
