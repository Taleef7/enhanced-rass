const { OpenAIEmbeddings } = require("@langchain/openai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

function createEmbeddingsProvider(config) {
  const { envKeys, embedding } = config;

  if (embedding.provider === "gemini") {
    if (!envKeys.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is required.");
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: envKeys.GEMINI_API_KEY,
      modelName: embedding.geminiModel,
      taskType: "RETRIEVAL_DOCUMENT",
    });

    console.log(
      `[Init] Embedding Provider: Gemini, Model: ${embedding.geminiModel}`
    );

    return embeddings;
  } else {
    if (!envKeys.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required.");
    }

    const embeddings = new OpenAIEmbeddings({
      apiKey: envKeys.OPENAI_API_KEY,
      model: embedding.openaiModel,
    });

    console.log(
      `[Init] Embedding Provider: OpenAI, Model: ${embedding.openaiModel}`
    );

    return embeddings;
  }
}

module.exports = { createEmbeddingsProvider };
