// rass-engine-service/src/retrieval/TopKSelectStage.js
// Selects the top-K documents from context.rankedChunks (or context.dedupedDocs if reranking is disabled)
// and stores them in context.selectedDocs for use by the generation stage.
// Applies "lost-in-the-middle" reordering: highest-scored chunk first, second-highest last,
// remaining chunks fill the middle. LLMs recall information best at the beginning and end
// of long contexts, so this placement maximises the use of the highest-quality chunks.

"use strict";

const { Stage } = require("./Stage");
const logger = require("../logger");

/**
 * 1.4 Lost-in-Middle Fix: Reorders documents so the highest-relevance chunks
 * appear at the start and end of the context window, where LLMs attend most.
 *
 * Input (descending relevance): [best, 2nd, 3rd, 4th, ...]
 * Output positions:              [best, 3rd, 4th, ..., 2nd]
 */
function lostInMiddleReorder(docs) {
  if (docs.length <= 2) return docs;
  const reordered = new Array(docs.length);
  reordered[0] = docs[0];                 // best chunk → first position
  reordered[docs.length - 1] = docs[1];   // second-best chunk → last position
  for (let i = 2; i < docs.length; i++) {
    reordered[i - 1] = docs[i];           // remaining chunks fill the middle
  }
  return reordered;
}

class TopKSelectStage extends Stage {
  constructor() {
    super("TopKSelectStage");
  }

  async run(context) {
    // Prefer reranked chunks; fall back to deduplicated docs, then raw candidate chunks
    const source =
      context.rankedChunks?.length > 0
        ? context.rankedChunks
        : context.dedupedDocs?.length > 0
        ? context.dedupedDocs
        : context.candidateChunks || [];

    const topK = context.topK || 5;
    const sliced = source.slice(0, topK);

    // Apply lost-in-middle reordering before sending to generation
    context.selectedDocs = lostInMiddleReorder(sliced);

    logger.info(
      `[TopKSelectStage] Selected ${context.selectedDocs.length} documents (topK=${topK}); applied lost-in-middle reordering.`
    );
    return context;
  }
}

module.exports = { TopKSelectStage };
