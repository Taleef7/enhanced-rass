// rass-engine-service/src/generation/streaming.js
// SSE helper and streaming generation pipeline for the RASS engine.

const { v4: uuidv4 } = require("uuid");
const { llmClient } = require("../clients/llmClient");
const {
  LLM_PROVIDER,
  OPENAI_MODEL_NAME,
  GEMINI_MODEL_NAME,
} = require("../config");
const { buildGenerationPrompt } = require("./generator");
const { CitationSchema } = require("../schemas/retrievalSchemas");
const logger = require("../logger");

/**
 * Writes a single Server-Sent Event chunk in OpenAI-compatible format.
 *
 * @param {import('express').Response} res - The Express response object.
 * @param {object|string} data - The SSE payload or the literal string "[DONE]".
 */
function writeSSE(res, data) {
  const id = uuidv4();
  const chunk =
    typeof data === "string"
      ? data
      : JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model:
            LLM_PROVIDER === "openai" ? OPENAI_MODEL_NAME : GEMINI_MODEL_NAME,
          ...data,
        });
  res.write(`data: ${chunk}\n\n`);
}

/**
 * Builds a structured citation array from source documents.
 * Returns validated citations conforming to CitationSchema.
 *
 * @param {object[]} sourceDocuments - Array of {text, metadata, initial_score, rerank_score} objects.
 * @param {string}   llmAnswer       - The generated answer text (for grounding verification).
 * @returns {object[]} Validated structured citations.
 */
function buildStructuredCitations(sourceDocuments, llmAnswer) {
  return sourceDocuments.reduce((acc, doc, i) => {
    const meta = doc.metadata || {};
    const relevanceScore =
      typeof doc.rerank_score === "number"
        ? doc.rerank_score
        : typeof doc.initial_score === "number"
        ? doc.initial_score
        : 0;

    const excerpt = (doc.text || "").substring(0, 200).trim();

    // Grounding estimate: heuristic check that the cited passage is represented in the answer.
    // Two-tier test: (1) direct phrase match — any PHRASE_LEN-char substring of the excerpt appears
    // verbatim in the answer; (2) significant-term match — at least 3 tokens >= MIN_WORD_LEN chars from
    // the excerpt appear in the answer. This reduces spurious "grounded" flags from trivial
    // single-word overlaps while remaining useful as a lightweight, dependency-free signal.
    let grounded = false;
    if (llmAnswer && excerpt) {
      const normalizedAnswer = llmAnswer.toLowerCase();
      const normalizedExcerpt = excerpt.toLowerCase();

      // Tier 1: look for any PHRASE_LEN-character phrase match
      const PHRASE_LEN = 30;
      const PHRASE_STEP = 10;
      const MIN_WORD_LEN = 5;
      for (let start = 0; start <= normalizedExcerpt.length - PHRASE_LEN; start += PHRASE_STEP) {
        if (normalizedAnswer.includes(normalizedExcerpt.substring(start, start + PHRASE_LEN))) {
          grounded = true;
          break;
        }
      }

      // Tier 2 fallback: require at least 3 significant tokens (>= MIN_WORD_LEN chars) from excerpt in answer
      if (!grounded) {
        const significantWords = normalizedExcerpt
          .split(/\W+/)
          .filter((w) => w.length >= MIN_WORD_LEN);
        const matchCount = significantWords.filter((w) => normalizedAnswer.includes(w)).length;
        grounded = matchCount >= 3;
      }
    }

    // Coerce pageNumber to an integer; omit when not a valid positive integer
    const rawPage = meta.pageNumber ?? meta.page_number;
    const pageNumber = rawPage !== undefined ? parseInt(rawPage, 10) : undefined;

    const raw = {
      index: i + 1,
      documentId:
        meta.documentId || meta.parentId || meta.docId || meta.id || uuidv4(),
      documentName:
        meta.originalFilename || meta.source || "Unknown",
      chunkId: meta.chunkId || undefined,
      relevanceScore,
      excerpt,
      pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : undefined,
      uploadedAt: meta.uploadedAt || undefined,
      grounded,
    };

    const parsed = CitationSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn("[Generation] Excluding invalid citation:", parsed.error.issues);
      return acc;
    }
    acc.push(parsed.data);
    return acc;
  }, []);
}

/**
 * Streams the LLM answer back to the client using SSE, then sends citations and [DONE].
 *
 * @param {import('express').Response} res - The Express response object.
 * @param {string} query - The user's question.
 * @param {object[]} sourceDocuments - Array of {text, metadata, initial_score, rerank_score} objects.
 */
async function streamAnswer(res, query, sourceDocuments) {
  const context = sourceDocuments.map((doc) => doc.text).join("\n\n---\n\n");
  const generationPrompt = buildGenerationPrompt(context, query);
  let fullAnswer = "";

  // Phase F (#129): Emit a 'context' event with the retrieved chunks before generation.
  // This powers the "What RASS is thinking" transparency panel in the frontend.
  const contextChunks = sourceDocuments.map((doc) => ({
    text: (doc.text || "").substring(0, 300),
    score: typeof doc.rerank_score === "number" ? doc.rerank_score : doc.initial_score,
    documentName: doc.metadata?.originalFilename || doc.metadata?.source || "Unknown",
  }));
  writeSSE(res, {
    choices: [
      {
        delta: {
          custom_meta: {
            type: "context",
            chunks: contextChunks,
          },
        },
      },
    ],
  });

  try {
    if (LLM_PROVIDER === "openai") {
      const completionStream = await llmClient.chat.completions.create({
        model: OPENAI_MODEL_NAME,
        messages: [{ role: "user", content: generationPrompt }],
        temperature: 0.3,
        max_tokens: 500,
        stream: true,
      });
      for await (const chunk of completionStream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) {
          fullAnswer += token;
          writeSSE(res, {
            choices: [{ delta: { content: token } }],
          });
        }
      }
    } else {
      // Gemini streaming
      const result = await llmClient.generateContentStream(generationPrompt);
      for await (const chunk of result.stream) {
        const token = chunk.text();
        if (token) {
          fullAnswer += token;
          writeSSE(res, { choices: [{ delta: { content: token } }] });
        }
      }
    }

    // Build structured citations after generation is complete (grounding needs the full answer)
    const structuredCitations = buildStructuredCitations(sourceDocuments, fullAnswer);

    // Emit a dedicated 'citations' SSE event (structured)
    writeSSE(res, {
      choices: [
        {
          delta: {
            custom_meta: {
              type: "citations",
              citations: structuredCitations,
            },
          },
        },
      ],
    });
  } catch (e) {
    logger.error("[Generation] Error during LLM stream:", e);
    writeSSE(res, {
      choices: [
        {
          delta: {
            content: "\n\nSorry, an error occurred during generation.",
          },
        },
      ],
    });
  } finally {
    writeSSE(res, "[DONE]");
    res.end();
    logger.info("[Generation] Stream finished.");
  }
}

module.exports = { writeSSE, streamAnswer };
