// embedding-service/src/chunking/FixedSizeChunker.js
// Splits documents into chunks of a fixed character size with configurable overlap.
// Uses LangChain's CharacterTextSplitter (non-recursive, splits on separator first).

"use strict";

const { CharacterTextSplitter } = require("langchain/text_splitter");
const { ChunkingStrategy } = require("./ChunkingStrategy");

class FixedSizeChunker extends ChunkingStrategy {
  /**
   * @param {object} options
   * @param {number} options.chunkSize - Maximum characters per chunk.
   * @param {number} options.chunkOverlap - Characters of overlap between chunks.
   * @param {string} [options.separator] - Separator string (default: "\n\n").
   */
  constructor({ chunkSize, chunkOverlap, separator = "\n\n" } = {}) {
    super("fixed_size", { chunkSize, chunkOverlap, separator });
    this._splitter = new CharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separator,
    });
  }

  async splitDocuments(docs) {
    return this._splitter.splitDocuments(docs);
  }
}

module.exports = { FixedSizeChunker };
