// rass-engine-service/src/generation/generator.js
// Non-streaming LLM answer generation from assembled context.

const { llmClient } = require("../clients/llmClient");
const { LLM_PROVIDER, OPENAI_MODEL_NAME } = require("../config");

/**
 * Builds the generation prompt from context documents and a user query.
 */
function buildGenerationPrompt(context, query) {
  return `
You are a knowledgeable assistant whose sole job is to answer the user's question by **only** using the information given in the Context. Do **not** hallucinate or bring in outside knowledge.

Guidelines:
1. Provide a concise, accurate answer in ideally 2–3 paragraphs or as per the users' request.
2. If the Context does not contain enough information to answer, reply exactly: "I don't have enough information to answer that question."
3. If the Context contains information that is not relevant to the question, do not include it in your answer.
4. If the Context contains multiple documents, synthesize the information into a coherent answer.
5. If the question is about a specific document, focus on that document's content.
6. If the question is about a general topic, use the most relevant documents to provide a comprehensive answer.
7. If the question is about a specific event or fact, ensure your answer is directly supported by the Context.


Context:
${context}

Question:
${query}

Answer:
`.trim();
}

/**
 * Generates a non-streaming answer from the LLM given source documents and a query.
 *
 * @param {string} query - The user's question.
 * @param {object[]} sourceDocuments - Array of {text, metadata} objects.
 * @returns {Promise<string>} The generated answer text.
 */
async function generateAnswer(query, sourceDocuments) {
  const context = sourceDocuments.map((doc) => doc.text).join("\n\n---\n\n");
  const generationPrompt = buildGenerationPrompt(context, query);

  let answer = "Sorry, I was unable to generate an answer.";
  try {
    if (LLM_PROVIDER === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: OPENAI_MODEL_NAME,
        messages: [{ role: "user", content: generationPrompt }],
        temperature: 0.3,
        max_tokens: 500,
      });
      answer = completion.choices[0].message.content;
    } else {
      const result = await llmClient.generateContent(generationPrompt);
      answer = result.response.text();
    }
  } catch (e) {
    console.error("[Generation] Error calling LLM:", e);
  }
  console.log(`[Generation] Final answer generated.`);
  return answer;
}

module.exports = { generateAnswer, buildGenerationPrompt };
