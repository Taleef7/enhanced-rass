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
const { CitationSchema } = require("../schemas/retrievalSchemas")

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
 * Streams the LLM answer back to the client using SSE, then sends citations and [DONE].
 *
 * @param {import('express').Response} res - The Express response object.
 * @param {string} query - The user's question.
 * @param {object[]} sourceDocuments - Array of {text, metadata} objects.
 */
async function streamAnswer(res, query, sourceDocuments) {
  const context = sourceDocuments.map((doc) => doc.text).join("\n\n---\n\n");
  const generationPrompt = buildGenerationPrompt(context, query);

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
        if (chunk.choices[0]?.delta?.content) {
          writeSSE(res, {
            choices: [{ delta: { content: chunk.choices[0].delta.content } }],
          });
        }
      }
    } else {
      // Gemini streaming
      const result = await llmClient.generateContentStream(generationPrompt);
      for await (const chunk of result.stream) {
        if (chunk.text()) {
          writeSSE(res, { choices: [{ delta: { content: chunk.text() } }] });
        }
      }
    }
    // Assemble and validate citations before sending them to the client
    const rawCitations = sourceDocuments.map((doc) => ({
      id: doc.metadata?.parentId || uuidv4(),
      source: doc.metadata?.originalFilename || doc.metadata?.source || "Unknown",
      score: doc.initial_score ?? 0,
      text: doc.text || "",
      uploadedAt: doc.metadata?.uploadedAt,
    }));

    const validatedCitations = rawCitations.filter((citation) => {
      const result = CitationSchema.safeParse(citation);
      if (!result.success) {
        console.warn("[Generation] Excluding invalid citation:", result.error.issues);
      }
      return result.success;
    });

    // Send citations after the token stream
    writeSSE(res, {
      choices: [{ delta: { custom_meta: { citations: validatedCitations } } }],
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
