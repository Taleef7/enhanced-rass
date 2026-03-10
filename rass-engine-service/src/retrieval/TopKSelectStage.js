// rass-engine-service/src/retrieval/TopKSelectStage.js
// Selects the top-K documents from context.rankedChunks (or context.dedupedDocs if reranking is disabled)
// and stores them in context.selectedDocs for use by the generation stage.

"use strict";

const { Stage } = require("./Stage");

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
    context.selectedDocs = source.slice(0, topK);

    console.log(
      `[TopKSelectStage] Selected ${context.selectedDocs.length} documents (topK=${topK}).`
    );
    return context;
  }
}

module.exports = { TopKSelectStage };
