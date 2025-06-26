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

  // A simple, effective prompt for generating a hypothetical answer.
  const prompt = `Please write a concise, ideal passage that directly answers the following question. This passage will be used to find the most relevant real documents.
Question: "${query}"

Passage:`;

  try {
    if (llmProvider === "openai") {
      const completion = await llmClient.chat.completions.create({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7, // A bit of creativity is helpful here
        max_tokens: 200, // Keep the hypothetical doc concise
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
