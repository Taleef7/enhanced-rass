// rass-engine-service/src/clients/llmClient.js
// LLM client factory — initializes either OpenAI or Gemini based on config.

const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  LLM_PROVIDER,
  OPENAI_MODEL_NAME,
  GEMINI_MODEL_NAME,
} = require("../config");

const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;

let llmClient;

if (LLM_PROVIDER === "openai") {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  llmClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log(`[Init] LLM Provider: OpenAI, Model: ${OPENAI_MODEL_NAME}`);
} else {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");
  const googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  llmClient = googleGenAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  console.log(`[Init] LLM Provider: Gemini, Model: ${GEMINI_MODEL_NAME}`);
}

module.exports = { llmClient };
