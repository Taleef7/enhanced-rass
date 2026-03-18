// mcp-server/src/services/memoryService.js
// Phase 4: User Memory System
//
// Extracts memorable facts about a user from conversation turns using an LLM,
// then persists them to the Memory table with lightweight deduplication.
//
// Usage:
//   extractAndSaveMemories(userId, chatId, userMessage, assistantMessage)
//   getUserMemories(userId, { limit, category })
//
// LLM priority: OpenAI (gpt-4o-mini) → Gemini (gemini-2.0-flash-lite) → skip

"use strict";

const { OpenAI } = require("openai");
const axios = require("axios");
const { prisma } = require("../prisma");
const logger = require("../logger");

const VALID_CATEGORIES = new Set(["preference", "expertise", "context", "goal"]);
const MAX_CACHED_MEMORIES = 100; // number of existing memories to load for dedup

// ── LLM extraction ────────────────────────────────────────────────────────────

function buildExtractionPrompt(userMessage, assistantMessage) {
  return (
    `Analyze this conversation turn and extract memorable facts about the user.\n` +
    `Return JSON: { "memories": [{"fact": "...", "category": "..."}] }\n` +
    `Categories (use exactly one): preference, expertise, context, goal\n` +
    `Only include facts the user explicitly stated about themselves.\n` +
    `If there are no notable facts, return { "memories": [] }\n\n` +
    `User: ${userMessage.slice(0, 400)}\n` +
    `Assistant: ${assistantMessage.slice(0, 400)}`
  );
}

async function callLLM(prompt) {
  // Try OpenAI first (already a dependency of mcp-server)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0,
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(completion.choices[0].message.content);
      return Array.isArray(parsed) ? parsed : (parsed.memories || []);
    } catch (err) {
      logger.warn(`[MemoryService] OpenAI extraction failed: ${err.message}`);
    }
  }

  // Fallback: Gemini via REST
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`;
      const response = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0 },
        },
        { timeout: 15000 }
      );
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const clean = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(clean);
      return Array.isArray(parsed) ? parsed : (parsed.memories || []);
    } catch (err) {
      logger.warn(`[MemoryService] Gemini extraction failed: ${err.message}`);
    }
  }

  return []; // No LLM available
}

// ── Lightweight deduplication ─────────────────────────────────────────────────

/**
 * Returns true if newFact is already represented by one of the existingFacts.
 * Uses substring containment as a simple similarity proxy.
 */
function isDuplicate(newFact, existingFacts) {
  const norm = newFact.toLowerCase().trim();
  return existingFacts.some((e) => {
    const existing = e.fact.toLowerCase().trim();
    return (
      existing.includes(norm) ||
      norm.includes(existing) ||
      // Jaccard-like: shared tokens / total tokens
      jaccardSimilarity(norm, existing) > 0.8
    );
  });
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extracts memorable facts from an assistant turn and persists new ones.
 * Should be called fire-and-forget (caller must not await unless testing).
 *
 * @param {string} userId            - User ID
 * @param {string|null} chatId       - Chat session ID (for provenance)
 * @param {string} userMessage       - The user's turn text
 * @param {string} assistantMessage  - The assistant's response text
 */
async function extractAndSaveMemories(userId, chatId, userMessage, assistantMessage) {
  if (!userId || !userMessage || !assistantMessage) return;

  try {
    const prompt = buildExtractionPrompt(userMessage, assistantMessage);
    const extracted = await callLLM(prompt);

    if (!Array.isArray(extracted) || extracted.length === 0) return;

    // Load recent memories for deduplication
    const existing = await prisma.memory.findMany({
      where: { userId },
      select: { fact: true },
      orderBy: { createdAt: "desc" },
      take: MAX_CACHED_MEMORIES,
    });

    let savedCount = 0;
    for (const item of extracted) {
      if (!item?.fact || typeof item.fact !== "string" || item.fact.trim().length < 5) continue;
      const category = VALID_CATEGORIES.has(item.category) ? item.category : "context";
      const fact = item.fact.trim();

      if (isDuplicate(fact, existing)) continue;

      await prisma.memory.create({
        data: { userId, fact, category, chatId: chatId || null },
      });

      existing.push({ fact }); // keep dedup list current
      savedCount++;
    }

    if (savedCount > 0) {
      logger.info(`[MemoryService] Saved ${savedCount} new memory fact(s) for user ${userId}`);
    }
  } catch (err) {
    logger.error(`[MemoryService] extractAndSaveMemories error: ${err.message}`);
  }
}

/**
 * Fetches stored memories for a user (most recent first).
 *
 * @param {string} userId
 * @param {object} opts
 * @param {number} [opts.limit=20]
 * @param {string} [opts.category]  - Filter by category
 * @param {string} [opts.query]     - Keyword filter (simple LIKE match on fact text)
 */
async function getUserMemories(userId, { limit = 20, category, query } = {}) {
  const where = { userId };
  if (category && VALID_CATEGORIES.has(category)) where.category = category;
  if (query) where.fact = { contains: query, mode: "insensitive" };

  return prisma.memory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
}

module.exports = { extractAndSaveMemories, getUserMemories };
