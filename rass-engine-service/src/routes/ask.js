// rass-engine-service/src/routes/ask.js
// POST /ask — Non-streaming RAG query endpoint.

const express = require("express");
const { embedText } = require("../clients/embedder");
const { osClient } = require("../clients/opensearchClient");
const { simpleSearch } = require("../retrieval/simpleSearch");
const { generateAnswer } = require("../generation/generator");
const { OPENSEARCH_INDEX_NAME, DEFAULT_TOP_K } = require("../config");
const { validateBody } = require("../middleware/validate");
const { AskBodySchema } = require("../schemas/askSchema");
const { RetrievalHitSchema } = require("../schemas/retrievalSchemas");

const router = express.Router();

router.get("/", (req, res) =>
  res.status(200).json({ status: "ok", message: "RASS Engine is running" })
);

router.post("/ask", validateBody(AskBodySchema), async (req, res) => {
  try {
    const { query, top_k } = req.validatedBody;

    console.log("---------------------------------");
    console.log(`[API /ask] Received query: "${query}", top_k: ${top_k}`);
    console.log("---------------------------------");

    const top_k_for_generation =
      typeof top_k === "number" ? top_k : DEFAULT_TOP_K;

    console.log("[Retrieval] Performing initial broad search...");
    const initialHits = await simpleSearch({
      term: query,
      embed: embedText,
      os: osClient,
      index: OPENSEARCH_INDEX_NAME,
    });

    if (!initialHits || initialHits.length === 0) {
      return res.json({
        answer: "I could not find any relevant information.",
        source_documents: [],
      });
    }

    // Validate hits against the canonical schema; log and exclude invalid hits
    const validHits = initialHits.filter((hit) => {
      const result = RetrievalHitSchema.safeParse(hit);
      if (!result.success) {
        console.warn(
          `[API /ask] Excluding invalid hit (id=${hit._id}):`,
          result.error.issues
        );
      }
      return result.success;
    });

    const source_documents = validHits
      .map((h) => ({
        text: h._source?.text,
        metadata: h._source?.metadata,
        initial_score: h._score,
      }))
      .filter((doc) => doc.text?.trim())
      .slice(0, top_k_for_generation);

    console.log(
      `[Generation] Generating with ${source_documents.length} documents...`
    );

    const answer = await generateAnswer(query, source_documents);
    return res.json({ answer, source_documents });
  } catch (e) {
    console.error("[API /ask] Endpoint error:", e);
    return res
      .status(500)
      .json({ error: e.message || "Error processing request." });
  }
});

module.exports = router;
