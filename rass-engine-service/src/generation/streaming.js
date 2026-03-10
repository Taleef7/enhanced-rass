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

    // Grounding check: does the answer text contain any significant words from the excerpt?
    let grounded = false;
    if (llmAnswer && excerpt) {
      const excerptWords = new Set(
        excerpt
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 5)
      );
      const answerText = llmAnswer.toLowerCase();
      grounded = [...excerptWords].some((word) => answerText.includes(word));
    }

    const raw = {
      index: i + 1,
      documentId: meta.parentId || meta.docId || uuidv4(),
      documentName:
        meta.originalFilename || meta.source || "Unknown",
      chunkId: meta.chunkId || undefined,
      relevanceScore,
      excerpt,
      pageNumber: meta.pageNumber || meta.page_number || undefined,
      uploadedAt: meta.uploadedAt || undefined,
      grounded,
    };

    const parsed = CitationSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[Generation] Excluding invalid citation:", parsed.error.issues);
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
    console.error("[Generation] Error during LLM stream:", e);
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
    console.log("[Generation] Stream finished.");
  }
}

module.exports = { writeSSE, streamAnswer };
