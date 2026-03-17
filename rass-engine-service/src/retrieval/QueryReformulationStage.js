// rass-engine-service/src/retrieval/QueryReformulationStage.js
// Phase 2.1: Conversational Query Reformulation
//
// Rewrites a follow-up question as a standalone question using the conversation history.
// Without this stage, follow-ups like "what did it say about the cost?" will fail
// because the retrieval system has no awareness of what "it" refers to.
//
// Implementation:
//   - If no conversation history (context.conversationHistory is empty), passes through unchanged.
//   - Otherwise, sends one cheap LLM call to reformulate the query into a self-contained question.
//   - Sets context.query to the reformulated question so all downstream stages (HyDE, embed, search)
//     operate on the enriched query.
//   - context.originalQuery retains the user's verbatim input.

"use strict";

const { Stage } = require("./Stage");
const { generateFromPrompt } = require("../generation/generator");
const logger = require("../logger");

class QueryReformulationStage extends Stage {
  /**
   * @param {object} config - Service config. Must include QUERY_REFORMULATION_ENABLED (boolean).
   */
  constructor(config) {
    super("QueryReformulationStage");
    this.config = config || {};
  }

  async run(context) {
    const enabled =
      this.config.QUERY_REFORMULATION_ENABLED === true ||
      this.config.QUERY_REFORMULATION_ENABLED === "true";

    if (!enabled) {
      logger.info("[QueryReformulationStage] QUERY_REFORMULATION_ENABLED=false — skipping.");
      return context;
    }

    const history = context.conversationHistory;

    // No prior conversation — nothing to reformulate
    if (!history || history.length === 0) {
      logger.info("[QueryReformulationStage] No conversation history — passing query through unchanged.");
      return context;
    }

    const userQuery = context.query;

    // Build a compact representation of recent history (last 8 messages)
    const recentHistory = history.slice(-8);
    const historyText = recentHistory
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = `You are a search query reformulation assistant. Your ONLY job is to rewrite the user's new question as a completely standalone question that can be understood without the conversation history.

Rules:
- Resolve all pronouns, abbreviations, and references to entities mentioned in the conversation (e.g., "it", "they", "the policy", "that document").
- If the question is already standalone, return it as-is.
- Return ONLY the reformulated question — no explanation, no quotes, no preamble.

Conversation history:
${historyText}

New question: ${userQuery}

Standalone question:`;

    try {
      const reformulated = await generateFromPrompt(prompt, { temperature: 0.1, maxTokens: 200 });
      const cleaned = (reformulated || "").trim();

      if (cleaned && cleaned.length > 0 && cleaned !== userQuery) {
        logger.info(
          `[QueryReformulationStage] Reformulated: "${userQuery.substring(0, 60)}" → "${cleaned.substring(0, 80)}"`
        );
        context.query = cleaned;
      } else {
        logger.info("[QueryReformulationStage] Reformulation unchanged — keeping original query.");
      }
    } catch (err) {
      // Non-fatal: if reformulation fails, proceed with original query
      logger.warn(`[QueryReformulationStage] Reformulation failed: ${err.message}. Using original query.`);
    }

    return context;
  }
}

module.exports = { QueryReformulationStage };
