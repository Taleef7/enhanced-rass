// rass-engine-service/src/providers/OllamaLLMProvider.js
// Phase G #135: Ollama LLM provider for fully local, offline operation.
//
// Ollama exposes an OpenAI-compatible chat completions API.
// This module wraps it using the standard OpenAI client pointed at the local Ollama server.
// Supports both streaming (SSE) and non-streaming generation, matching the behaviour
// of the existing OpenAI provider so no changes are required in streaming.js or generator.js.
//
// Configuration (config.yml):
//   LLM_PROVIDER: ollama
//   OLLAMA_BASE_URL: http://ollama:11434
//   OLLAMA_LLM_MODEL: llama3.2

"use strict";

const { OpenAI } = require("openai");
const logger = require("../logger");

/**
 * Creates an OpenAI-SDK client configured to target a local Ollama server.
 *
 * @param {object} opts
 * @param {string} opts.ollamaBaseUrl - Ollama server base URL (default: http://ollama:11434)
 * @returns {OpenAI} OpenAI-compatible client targeting Ollama
 */
function createOllamaLLMClient({ ollamaBaseUrl } = {}) {
  const baseURL = (ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/v1";
  logger.info(`[OllamaLLM] Initialising Ollama LLM provider (baseURL=${baseURL})`);

  // Ollama accepts any non-empty string as the API key
  return new OpenAI({
    baseURL,
    apiKey: "ollama",
  });
}

module.exports = { createOllamaLLMClient };
