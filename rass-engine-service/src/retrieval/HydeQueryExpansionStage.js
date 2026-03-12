// rass-engine-service/src/retrieval/HydeQueryExpansionStage.js
// HyDE (Hypothetical Document Embeddings) query expansion stage.
// When HYDE_ENABLED=true, generates a hypothetical document for the user's query
// and uses it to augment the query text before embedding.
// Falls back to the original query on LLM failure (no crash).

"use strict";

const { Stage } = require("./Stage");
const { generateHypotheticalDocument } = require("../planner/hydeGenerator");
const logger = require("../logger");

class HydeQueryExpansionStage extends Stage {
  /**
   * @param {object} config - Service config. Must include HYDE_ENABLED (boolean).
   */
  constructor(config) {
    super("HydeQueryExpansionStage");
    this.config = config || {};
  }

  async run(context) {
    const hydeEnabled = this.config.HYDE_ENABLED === true || this.config.HYDE_ENABLED === "true";

    if (!hydeEnabled) {
      logger.info("[HydeQueryExpansionStage] HYDE_ENABLED=false — skipping.");
      return context;
    }

    // Resolve max tokens from config, defaulting to 200 if not set or invalid
    const rawMaxTokens = this.config.HYDE_MAX_TOKENS;
    const hydeMaxTokens =
      Number.isFinite(Number(rawMaxTokens)) && Number(rawMaxTokens) > 0
        ? Number(rawMaxTokens)
        : 200;

    logger.info(
      `[HydeQueryExpansionStage] Generating hypothetical document for: "${context.originalQuery}" (maxTokens=${hydeMaxTokens})`
    );

    let hypotheticalDoc = null;
    try {
      hypotheticalDoc = await generateHypotheticalDocument(context.originalQuery, hydeMaxTokens);
    } catch (err) {
      logger.warn(
        `[HydeQueryExpansionStage] HyDE generation failed: ${err.message}. Falling back to original query.`
      );
    }

    if (hypotheticalDoc && hypotheticalDoc !== context.originalQuery) {
      // Concatenate original query + hypothetical document for richer embedding signal
      context.query = `${context.originalQuery}\n\n${hypotheticalDoc}`;
      logger.info(
        `[HydeQueryExpansionStage] Expanded query length: ${context.query.length} chars.`
      );
    } else {
      logger.info("[HydeQueryExpansionStage] No expansion applied; using original query.");
    }

    return context;
  }
}

module.exports = { HydeQueryExpansionStage };
