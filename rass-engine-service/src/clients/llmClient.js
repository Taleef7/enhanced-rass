// rass-engine-service/src/clients/llmClient.js
// LLM client factory — initializes OpenAI, Gemini, or Ollama (Phase G) based on config.

const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createOllamaLLMClient } = require("../providers/OllamaLLMProvider");
const logger = require("../logger");
const {
  LLM_PROVIDER,
  OPENAI_MODEL_NAME,
  GEMINI_MODEL_NAME,
  OLLAMA_BASE_URL,
  OLLAMA_LLM_MODEL,
} = require("../config");

const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;

let llmClient;

if (LLM_PROVIDER === "openai") {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  llmClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  logger.info(`[Init] LLM Provider: OpenAI, Model: ${OPENAI_MODEL_NAME}`);
} else if (LLM_PROVIDER === "ollama") {
  // Phase G #135: Ollama local model support
  llmClient = createOllamaLLMClient({ ollamaBaseUrl: OLLAMA_BASE_URL });
  logger.info(`[Init] LLM Provider: Ollama, Model: ${OLLAMA_LLM_MODEL || "llama3.2"}, BaseURL: ${OLLAMA_BASE_URL || "http://ollama:11434"}`);
} else {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");
  const googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  llmClient = googleGenAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
  logger.info(`[Init] LLM Provider: Gemini, Model: ${GEMINI_MODEL_NAME}`);
}

module.exports = { llmClient };
