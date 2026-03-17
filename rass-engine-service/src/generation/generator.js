// rass-engine-service/src/generation/generator.js
// Non-streaming LLM answer generation from assembled context.

const { llmClient } = require("../clients/llmClient");
const { LLM_PROVIDER, OPENAI_MODEL_NAME, OLLAMA_LLM_MODEL, LLM_MAX_TOKENS } = require("../config");
const logger = require("../logger");

// 1.5: Conservative model context window (tokens). Most models support 32k–128k+;
// using 32k as the safe lower bound ensures compatibility across all providers.
const MODEL_CONTEXT_TOKENS = 32768;
const CHARS_PER_TOKEN = 4; // approximation: 1 token ≈ 4 characters

/**
 * 1.5 Token Budget: Filters sourceDocuments to fit within the available context window.
 * Reserves space for: system prompt, query, response (LLM_MAX_TOKENS), and a safety buffer.
 *
 * @param {object[]} sourceDocuments - Full list of {text, metadata} objects.
 * @param {string}   query           - The user's query (needed to estimate its token cost).
 * @param {number}   [maxResponseTokens] - Max tokens reserved for the LLM response.
 * @returns {{ docs: object[], usedChars: number, availableChars: number }}
 */
function applyTokenBudget(sourceDocuments, query, maxResponseTokens = LLM_MAX_TOKENS) {
  const SYSTEM_PROMPT_TOKENS = 150; // rough estimate for system instructions
  const BUFFER_TOKENS = 500;
  const queryTokens = Math.ceil((query || "").length / CHARS_PER_TOKEN);

  const availableTokens =
    MODEL_CONTEXT_TOKENS - maxResponseTokens - queryTokens - SYSTEM_PROMPT_TOKENS - BUFFER_TOKENS;
  const availableChars = Math.max(availableTokens * CHARS_PER_TOKEN, 0);

  let usedChars = 0;
  const includedDocs = [];

  for (const doc of sourceDocuments) {
    const docChars = (doc.text || "").length;
    if (usedChars + docChars > availableChars) {
      logger.info(
        `[TokenBudget] Budget exhausted at doc ${includedDocs.length + 1}/${sourceDocuments.length}. ` +
        `Used ${usedChars}/${availableChars} chars (~${Math.ceil(usedChars / CHARS_PER_TOKEN)}/${Math.ceil(availableChars / CHARS_PER_TOKEN)} tokens).`
      );
      break;
    }
    includedDocs.push(doc);
    usedChars += docChars;
  }

  return { docs: includedDocs, usedChars, availableChars };
}

/**
 * 1.7 Inline Citations: Builds the generation prompt from numbered source documents.
 * Documents are numbered [1], [2], ... and the model is instructed to cite inline.
 *
 * @param {object[]} sourceDocuments - Array of {text, metadata} objects (already budget-filtered).
 * @param {string}   query           - The user's question.
 */
function buildGenerationPrompt(sourceDocuments, query) {
  // Build numbered document list with filename headers
  const numberedDocs = sourceDocuments
    .map((doc, i) => {
      const name = doc.metadata?.originalFilename || doc.metadata?.source || "Unknown";
      return `[${i + 1}] Document: ${name}\n${doc.text || ""}`;
    })
    .join("\n\n---\n\n");

  return `You are a knowledgeable assistant whose sole job is to answer the user's question by **only** using the information given in the numbered documents below. Do **not** hallucinate or bring in outside knowledge.

Guidelines:
1. After each factual claim, add an inline citation marker [N] citing the source document number (e.g., "The policy states X [1].").
2. Provide a concise, accurate answer in 2–3 paragraphs or as requested.
3. If the documents do not contain enough information to answer, reply exactly: "I don't have enough information to answer that question."
4. Do not include information from documents that are not relevant to the question.
5. If multiple documents contain relevant information, synthesize them into a coherent answer with citations.

Documents:
${numberedDocs}

Question: ${query}

Answer:`.trim();
}

/**
 * Returns the model name for OpenAI-compatible providers (openai or ollama).
 */
function getOpenAICompatibleModel() {
  if (LLM_PROVIDER === "ollama") return OLLAMA_LLM_MODEL || "llama3.2";
  return OPENAI_MODEL_NAME;
}

async function generateFromPrompt(
  prompt,
  { temperature = 0.3, maxTokens = LLM_MAX_TOKENS } = {}
) {
  if (LLM_PROVIDER === "openai" || LLM_PROVIDER === "ollama") {
    const completion = await llmClient.chat.completions.create({
      model: getOpenAICompatibleModel(),
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    });
    return completion.choices[0].message.content;
  }

  const result = await llmClient.generateContent(prompt);
  return result.response.text();
}

/**
 * Generates a non-streaming answer from the LLM given source documents and a query.
 *
 * @param {string} query - The user's question.
 * @param {object[]} sourceDocuments - Array of {text, metadata} objects.
 * @returns {Promise<string>} The generated answer text.
 */
async function generateAnswer(query, sourceDocuments) {
  const { docs: budgetDocs } = applyTokenBudget(sourceDocuments, query);
  const generationPrompt = buildGenerationPrompt(budgetDocs, query);

  let answer = "Sorry, I was unable to generate an answer.";
  try {
    answer = await generateFromPrompt(generationPrompt, {
      temperature: 0.3,
      maxTokens: LLM_MAX_TOKENS,
    });
  } catch (e) {
    logger.error("[Generation] Error calling LLM:", e);
  }
  logger.info(`[Generation] Final answer generated.`);
  return answer;
}

module.exports = {
  generateAnswer,
  buildGenerationPrompt,
  generateFromPrompt,
  applyTokenBudget,
};
