// rass-engine-service/src/routes/streamAsk.js
// POST /stream-ask — Streaming RAG query endpoint (SSE).
// userId is optional: when provided, results are scoped to that user;
// when absent (e.g. LibreChat / MCP tool proxy), results are unscoped.

const express = require("express");
const { writeSSE, streamAnswer } = require("../generation/streaming");
const { DEFAULT_TOP_K } = require("../config");
const config = require("../config");
const { validateBody } = require("../middleware/validate");
const { StreamAskBodySchema } = require("../schemas/askSchema");
const { RetrievalHitSchema } = require("../schemas/retrievalSchemas");
const { createPipeline } = require("../retrieval/createPipeline");
const { createContext } = require("../retrieval/context");
const { queryLatencySeconds } = require("../metrics");

const router = express.Router();

// Create the retrieval pipeline once at startup (all stages are stateless per-run)
const pipeline = createPipeline(config);

router.post("/stream-ask", validateBody(StreamAskBodySchema), async (req, res) => {
  try {
    const { query, documents, userId, top_k, kbId, conversationHistory, llmApiKeyOverride } = req.validatedBody;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Register close handler early so we detect client disconnects during retrieval or generation.
    res.on("close", () => {
      req.log.info("[API /stream-ask] Client closed connection.");
    });

    req.log.info("---------------------------------");
    req.log.info(
      `[API /stream-ask] Received query: "${query}", top_k: ${top_k}, kbId: ${kbId || "default"}`
    );
    if (userId) req.log.info(`[API /stream-ask] Request from user: ${userId}`);
    if (conversationHistory?.length) req.log.info(`[API /stream-ask] Conversation history: ${conversationHistory.length} messages`);
    req.log.info("---------------------------------");

    const topK = typeof top_k === "number" ? top_k : DEFAULT_TOP_K;

    // Run the full retrieval pipeline
    const context = createContext({ query, userId, documents, topK, kbId, conversationHistory, llmApiKeyOverride, config });
    const pipelineStart = Date.now();
    const result = await pipeline.run(context);
    queryLatencySeconds.observe({ stage: "pipeline" }, (Date.now() - pipelineStart) / 1000);

    if (res.writableEnded || res.destroyed) return;

    const selectedDocs = result.selectedDocs || [];

    if (selectedDocs.length === 0) {
      req.log.warn("[stream-ask] No documents found after pipeline.");
      writeSSE(res, {
        choices: [
          { delta: { content: "I could not find any relevant information." } },
        ],
      });
      writeSSE(res, {
        choices: [{ delta: { custom_meta: { type: "citations", citations: [] } } }],
      });
      writeSSE(res, "[DONE]");
      res.end();
      return;
    }

    // Validate hits against the canonical schema; log and exclude invalid hits
    const validHits = selectedDocs.filter((hit) => {
      const r = RetrievalHitSchema.safeParse(hit);
      if (!r.success) {
        req.log.warn(
          `[API /stream-ask] Excluding invalid hit (id=${hit._id}):`,
          r.error.issues
        );
      }
      return r.success;
    });

    const source_documents = validHits
      .map((h) => ({
        text: h._source?.text,
        metadata: h._source?.metadata,
        initial_score: h._score,
        rerank_score: h.rerankScore,
      }))
      .filter((doc) => doc.text?.trim());

    if (res.writableEnded || res.destroyed) return;

    req.log.info(
      `[Generation] Streaming with ${source_documents.length} documents...`
    );

    // Use result.query (possibly reformulated by QueryReformulationStage) for generation.
    // This ensures the LLM sees the standalone, context-enriched question, not the raw follow-up.
    const effectiveQuery = result.query || query;
    await streamAnswer(res, effectiveQuery, source_documents, result.llmApiKeyOverride || null);
  } catch (e) {
    req.log.error({ err: e }, "[API /stream-ask] Endpoint error.");
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || "Error processing request." });
    } else {
      res.end();
    }
  }
});

module.exports = router;
