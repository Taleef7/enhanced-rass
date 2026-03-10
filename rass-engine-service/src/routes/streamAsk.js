// rass-engine-service/src/routes/streamAsk.js
// POST /stream-ask — Streaming RAG query endpoint (SSE).

const express = require("express");
const { embedText } = require("../clients/embedder");
const { osClient } = require("../clients/opensearchClient");
const { simpleSearch } = require("../retrieval/simpleSearch");
const { writeSSE, streamAnswer } = require("../generation/streaming");
const { OPENSEARCH_INDEX_NAME, DEFAULT_TOP_K } = require("../config");

const router = express.Router();

router.post("/stream-ask", async (req, res) => {
  try {
    const { query, documents, userId, top_k } = req.body;
    if (!query || !userId) {
      return res.status(400).json({ error: "Missing query or userId" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    console.log("---------------------------------");
    console.log(
      `[API /stream-ask] Received query: "${query}", top_k: ${top_k}`
    );
    console.log(`[API /stream-ask] Received query from user: ${userId}`);
    console.log("---------------------------------");

    const top_k_for_generation =
      typeof top_k === "number" ? top_k : DEFAULT_TOP_K;

    console.log("[Retrieval Stage 1] Performing initial broad search...");
    const initialHits = await simpleSearch({
      term: query,
      embed: embedText,
      os: osClient,
      index: OPENSEARCH_INDEX_NAME,
      userId,
      documents,
    });

    if (!initialHits || initialHits.length === 0) {
      console.warn("[stream-ask] No documents found in initial search.");
      writeSSE(res, {
        choices: [
          { delta: { content: "I could not find any relevant information." } },
        ],
      });
      writeSSE(res, {
        choices: [{ delta: { custom_meta: { citations: [] } } }],
      });
      writeSSE(res, "[DONE]");
      res.end();
      return;
    }

    // Stage 2: Context-aware search refinement
    // TODO: Activate two-stage retrieval by uncommenting the block below once
    // provider configuration is stabilised (Issue #100 / searchPlanner.js).
    // const initialContext = initialHits.map((hit) => hit._source.text).join("\n\n---\n\n");
    // const refinedPlan = await createRefinedSearchPlan(query, initialContext);
    // const finalParentDocs = await runSteps({ plan: refinedPlan, embed: embedText, os: osClient, index: OPENSEARCH_INDEX_NAME, userId, documents });
    const finalParentDocs = initialHits;

    const source_documents = finalParentDocs
      .map((h) => ({
        text: h._source?.text,
        metadata: h._source?.metadata,
        initial_score: h._score,
      }))
      .filter((doc) => doc.text?.trim())
      .slice(0, top_k_for_generation);

    console.log(
      `[Generation] Streaming with ${source_documents.length} documents...`
    );

    await streamAnswer(res, query, source_documents);

    res.on("close", () => {
      console.log("[API /stream-ask] Client closed connection.");
    });
  } catch (e) {
    console.error("[API /stream-ask] Endpoint error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || "Error processing request." });
    } else {
      res.end();
    }
  }
});

module.exports = router;
