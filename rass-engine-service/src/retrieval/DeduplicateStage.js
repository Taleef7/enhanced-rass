// rass-engine-service/src/retrieval/DeduplicateStage.js
// Removes duplicate parent documents (same text/content from multiple child hits).
// Stores deduplicated documents in context.dedupedDocs.

"use strict";

const { Stage } = require("./Stage");
const logger = require("../logger");

class DeduplicateStage extends Stage {
  constructor() {
    super("DeduplicateStage");
  }

  async run(context) {
    const { parentDocs } = context;

    if (!parentDocs || parentDocs.length === 0) {
      context.dedupedDocs = [];
      return context;
    }

    // Deduplicate by the text content of the source document
    const seenTexts = new Set();
    const deduped = [];

    for (const doc of parentDocs) {
      const text = doc._source?.text?.trim();
      if (!text) continue;
      if (!seenTexts.has(text)) {
        seenTexts.add(text);
        deduped.push(doc);
      }
    }

    logger.info(
      `[DeduplicateStage] Reduced ${parentDocs.length} docs → ${deduped.length} unique docs.`
    );
    context.dedupedDocs = deduped;
    return context;
  }
}

module.exports = { DeduplicateStage };
