// embedding-service/src/chunking/RecursiveCharacterChunker.js
// Splits documents using LangChain's RecursiveCharacterTextSplitter.
// Tries multiple separators ("\n\n", "\n", " ", "") in order until chunks fit.
// This is the most commonly effective general-purpose chunker.

"use strict";

const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { ChunkingStrategy } = require("./ChunkingStrategy");

class RecursiveCharacterChunker extends ChunkingStrategy {
  /**
   * @param {object} options
   * @param {number} options.chunkSize - Maximum characters per chunk.
   * @param {number} options.chunkOverlap - Characters of overlap between chunks.
   */
  constructor({ chunkSize, chunkOverlap } = {}) {
    super("recursive_character", { chunkSize, chunkOverlap });
    this._splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });
  }

  async splitDocuments(docs) {
    return this._splitter.splitDocuments(docs);
  }
}

module.exports = { RecursiveCharacterChunker };
