// embedding-service/src/providers/OllamaEmbeddingProvider.js
// Phase G #135: Ollama embedding provider for fully local, offline operation.
//
// Ollama exposes an OpenAI-compatible embeddings API at /v1/embeddings.
// This provider wraps it using the standard OpenAI client pointed at the local Ollama server.
// No external API keys required — ideal for air-gapped or privacy-sensitive deployments.
//
// Configuration (config.yml):
//   EMBEDDING_PROVIDER: ollama
//   OLLAMA_BASE_URL: http://ollama:11434   (or http://localhost:11434 for local dev)
//   EMBEDDING_MODEL: nomic-embed-text      (recommended 768d model)
//   EMBED_DIM: 768

"use strict";

const { OpenAIEmbeddings } = require("@langchain/openai");
const logger = require("../logger");

/**
 * Creates a LangChain-compatible embeddings client that targets a local Ollama server.
 * Ollama's OpenAI-compatible API accepts requests at OLLAMA_BASE_URL/v1.
 *
 * @param {object} opts
 * @param {string} opts.ollamaBaseUrl - Base URL of the Ollama server (default: http://ollama:11434)
 * @param {string} opts.modelName     - Ollama embedding model name (default: nomic-embed-text)
 * @returns {OpenAIEmbeddings} LangChain embeddings client configured for Ollama
 */
function createOllamaEmbeddings({ ollamaBaseUrl, modelName } = {}) {
  const baseURL = (ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/v1";
  const model = modelName || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

  logger.info(`[OllamaEmbedding] Initialising Ollama embedding provider (model=${model}, baseURL=${baseURL})`);

  // Ollama's OpenAI-compatible API accepts any non-empty string as the API key
  return new OpenAIEmbeddings({
    configuration: {
      baseURL,
      apiKey: "ollama",
    },
    model,
    // Ollama does not support batching through the OpenAI embeddings path; process individually
    batchSize: 1,
  });
}

module.exports = { createOllamaEmbeddings };
