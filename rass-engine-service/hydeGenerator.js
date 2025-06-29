/**
 * Generates a hypothetical document in response to a user's query.
 * This is the core of the HyDE (Hypothetical Document Embeddings) technique.
 *
 * @param {object} llmClient - The initialized OpenAI or Gemini client.
 * @param {string} llmProvider - The provider name ('openai' or 'gemini').
 * @param {string} modelName - The specific model name to use for generation.
 * @param {string} query - The user's original query.
 * @returns {Promise<string>} A promise that resolves to the generated hypothetical document text.
 */
async function generateHypotheticalDocument(
  llmClient,
  llmProvider,
  modelName,
  query
) {
  console.log(`[HyDE] Generating hypothetical document for query: "${query}"`);

  // Enhanced prompt that encourages more detailed and contextual responses
  const prompt = `You are tasked with writing a detailed, informative passage that would perfectly answer the following question. Write as if you are an expert providing a comprehensive answer with specific details, examples, and context.

Question: "${query}"

Write a detailed passage (150-250 words) that:
- Directly answers the question with specific information
- Includes relevant details and context
- Uses terminology and style consistent with authoritative sources
- Provides concrete examples or evidence where appropriate

Passage:`;

  try {
    if (llmProvider === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5, // Slightly less creative for more factual content
        max_tokens: 300, // Allow for more detailed responses
      });
      const hypotheticalDoc = completion.choices[0].message.content;
      console.log(
        `[HyDE] Generated document (OpenAI): "${hypotheticalDoc.substring(
          0,
          100
        )}..."`
      );
      return hypotheticalDoc;
    } else if (llmProvider === "gemini") {
      const result = await llmClient.generateContent(prompt);
      const response = await result.response;
      const hypotheticalDoc = response.text();
      console.log(
        `[HyDE] Generated document (Gemini): "${hypotheticalDoc.substring(
          0,
          100
        )}..."`
      );
      return hypotheticalDoc;
    } else {
      throw new Error(
        `Unsupported LLM provider in generateHypotheticalDocument: ${llmProvider}`
      );
    }
  } catch (error) {
    console.error(
      "[HyDE] Error generating hypothetical document:",
      error.message
    );
    // As a fallback, we can just use the original query if HyDE fails.
    // This makes the system more resilient.
    console.warn("[HyDE] Falling back to using the original query for search.");
    return query;
  }
}

module.exports = { generateHypotheticalDocument };
