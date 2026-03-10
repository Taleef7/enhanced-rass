// embedding-service/src/chunking/index.js
// Factory that creates the appropriate chunking strategy based on a strategy name string.
// Used by the ingestion worker to apply the configured (or per-upload overridden) strategy.

"use strict";

const { FixedSizeChunker } = require("./FixedSizeChunker");
const { RecursiveCharacterChunker } = require("./RecursiveCharacterChunker");
const { SentenceWindowChunker } = require("./SentenceWindowChunker");

const SUPPORTED_STRATEGIES = ["fixed_size", "recursive_character", "sentence_window"];

/**
 * Factory function: instantiates the requested chunking strategy.
 *
 * @param {string} strategy - One of "fixed_size" | "recursive_character" | "sentence_window"
 * @param {object} options  - Strategy-specific parameters (see individual classes)
 * @returns {import('./ChunkingStrategy').ChunkingStrategy}
 */
function createChunker(strategy, options = {}) {
  switch (strategy) {
    case "fixed_size":
      return new FixedSizeChunker(options);
    case "recursive_character":
      return new RecursiveCharacterChunker(options);
    case "sentence_window":
      return new SentenceWindowChunker(options);
    default:
      throw new Error(
        `Unknown chunking strategy: "${strategy}". Supported: ${SUPPORTED_STRATEGIES.join(", ")}`
      );
  }
}

module.exports = { createChunker, SUPPORTED_STRATEGIES };
