// embedding-service/src/chunking/ChunkingStrategy.js
// Abstract base class for all chunking strategies.
// Subclasses must implement splitDocuments(docs).

"use strict";

class ChunkingStrategy {
  /**
   * @param {string} name - Human-readable strategy name stored in provenance.
   * @param {object} options - Strategy-specific parameters stored in provenance.
   */
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  /**
   * Split an array of LangChain Documents into parent chunks.
   * @param {import('langchain/schema').Document[]} docs
   * @returns {Promise<import('langchain/schema').Document[]>}
   */
  async splitDocuments(docs) {
    throw new Error(`${this.constructor.name}.splitDocuments() is not implemented`);
  }

  /**
   * Returns a serializable descriptor for DocumentProvenance.chunkingStrategy.
   */
  toProvenanceDescriptor() {
    return { strategy: this.name, ...this.options };
  }
}

module.exports = { ChunkingStrategy };
