// embedding-service/src/chunking/SentenceWindowChunker.js
// Splits documents on sentence boundaries, then groups sentences into sliding
// windows of configurable size with configurable overlap.
// Preserves sentence integrity — ideal for Q&A and information extraction tasks.

"use strict";

const { Document } = require("langchain/document");
const { ChunkingStrategy } = require("./ChunkingStrategy");

// Matches sentence-ending punctuation followed by whitespace or end-of-string.
const SENTENCE_END_RE = /(?<=[.!?])\s+(?=[A-Z"'\u201C\u2018])|(?<=[.!?])$/gm;

/**
 * Split a single string into sentences using punctuation heuristics.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoSentences(text) {
  const parts = text.split(SENTENCE_END_RE);
  return parts.map((s) => s.trim()).filter(Boolean);
}

class SentenceWindowChunker extends ChunkingStrategy {
  /**
   * @param {object} options
   * @param {number} [options.windowSize=5]   - Number of sentences per chunk.
   * @param {number} [options.overlapSentences=1] - Sentences shared between adjacent chunks.
   */
  constructor({ windowSize = 5, overlapSentences = 1 } = {}) {
    super("sentence_window", { windowSize, overlapSentences });
    this.windowSize = windowSize;
    this.overlapSentences = Math.min(overlapSentences, windowSize - 1);
  }

  async splitDocuments(docs) {
    const result = [];

    for (const doc of docs) {
      const sentences = splitIntoSentences(doc.pageContent);
      if (sentences.length === 0) continue;

      const step = Math.max(1, this.windowSize - this.overlapSentences);
      for (let i = 0; i < sentences.length; i += step) {
        const window = sentences.slice(i, i + this.windowSize);
        if (window.length === 0) break;
        result.push(
          new Document({
            pageContent: window.join(" "),
            metadata: { ...doc.metadata },
          })
        );
      }
    }

    return result;
  }
}

module.exports = { SentenceWindowChunker, splitIntoSentences };
