// rass-engine-service/src/retrieval/QueryReformulationStage.js
// Phase 2.1: Conversational Query Reformulation
// Phase 4.3: User Memory Injection
//
// Rewrites a follow-up question as a standalone question using the conversation history.
// Also injects relevant user memories into the reformulation prompt for personalization.
//
// Implementation:
//   - Fetches top-3 user memories from mcp-server /internal/memories (Phase 4.3).
//   - If no conversation history, passes through unchanged (but memories are still stored).
//   - Otherwise, sends one LLM call to reformulate the query as a standalone question.
//   - Sets context.query to the reformulated question; context.originalQuery stays verbatim.

"use strict";

const axios = require("axios");
const { Stage } = require("./Stage");
const { generateFromPrompt } = require("../generation/generator");
const logger = require("../logger");

// Internal mcp-server base URL (same pattern as FeedbackBoostStage)
const MCP_SERVER_INTERNAL_URL =
  process.env.MCP_SERVER_URL || "http://mcp-server:8080";
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const internalHeaders = INTERNAL_SERVICE_TOKEN
  ? { "x-internal-token": INTERNAL_SERVICE_TOKEN }
  : {};

/**
 * Fetches up to 3 recent memories for the given userId.
 * Returns an empty array on failure (non-fatal).
 */
async function fetchUserMemories(userId, query) {
  if (!userId) return [];
  try {
    const params = new URLSearchParams({ userId, limit: "3" });
    if (query) params.set("query", query.slice(0, 100));
    const response = await axios.get(
      `${MCP_SERVER_INTERNAL_URL}/internal/memories?${params.toString()}`,
      { timeout: 3000, headers: internalHeaders }
    );
    return response.data?.memories || [];
  } catch (_) {
    return [];
  }
}

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
    const userQuery = context.query;

    // Phase 4.3: Fetch user memories in parallel with the main logic
    const memories = await fetchUserMemories(context.userId, userQuery);
    context.userMemories = memories; // store for potential use by generation stage

    // No prior conversation — nothing to reformulate
    if (!history || history.length === 0) {
      logger.info("[QueryReformulationStage] No conversation history — passing query through unchanged.");
      return context;
    }

    // Build a compact representation of recent history (last 8 messages)
    const recentHistory = history.slice(-8);
    const historyText = recentHistory
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    // Include user memories in the reformulation context (Phase 4.3)
    const memorySection =
      memories.length > 0
        ? `\nUser context (from past conversations):\n${memories.map((m) => `- ${m.fact}`).join("\n")}\n`
        : "";

    const prompt = `You are a search query reformulation assistant. Your ONLY job is to rewrite the user's new question as a completely standalone question that can be understood without the conversation history.

Rules:
- Resolve all pronouns, abbreviations, and references to entities mentioned in the conversation (e.g., "it", "they", "the policy", "that document").
- If the question is already standalone, return it as-is.
- Return ONLY the reformulated question — no explanation, no quotes, no preamble.
${memorySection}
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
