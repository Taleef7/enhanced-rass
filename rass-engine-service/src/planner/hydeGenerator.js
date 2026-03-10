// rass-engine-service/src/planner/hydeGenerator.js
// HyDE (Hypothetical Document Embeddings) — generates a hypothetical document
// passage from the user's query to improve embedding-based retrieval recall.

const { llmClient } = require("../clients/llmClient");
const { LLM_PROVIDER, OPENAI_MODEL_NAME, GEMINI_MODEL_NAME } = require("../config");

/**
 * Generates a hypothetical document in response to a user's query.
 *
 * @param {string} query - The user's original query.
 * @returns {Promise<string>} The generated hypothetical document text.
 */
async function generateHypotheticalDocument(query) {
  console.log(`[HyDE] Generating hypothetical document for query: "${query}"`);

  const prompt = `Based on the context of a user's documents, write a short, hypothetical passage that perfectly answers the following user question.
The passage should sound like it was extracted directly from one of the user's documents. Do not use general knowledge.

User Question: "${query}"

Hypothetical Passage:`;

  try {
    if (LLM_PROVIDER === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: OPENAI_MODEL_NAME,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 300,
      });
      const hypotheticalDoc = completion.choices[0].message.content;
      console.log(
        `[HyDE] Generated document (OpenAI): "${hypotheticalDoc.substring(0, 100)}..."`
      );
      return hypotheticalDoc;
    } else if (LLM_PROVIDER === "gemini") {
      const result = await llmClient.generateContent(prompt);
      const response = await result.response;
      const hypotheticalDoc = response.text();
      console.log(
        `[HyDE] Generated document (Gemini): "${hypotheticalDoc.substring(0, 100)}..."`
      );
      return hypotheticalDoc;
    } else {
      throw new Error(
        `Unsupported LLM provider in generateHypotheticalDocument: ${LLM_PROVIDER}`
      );
    }
  } catch (error) {
    console.error("[HyDE] Error generating hypothetical document:", error.message);
    console.warn("[HyDE] Falling back to using the original query for search.");
    return query;
  }
}

module.exports = { generateHypotheticalDocument };
