// embedding-service/src/providers/contextualRetrieval.js
// Phase 3.1: LLM-generated contextual prefix for each child chunk at ingestion.
//
// Anthropic research shows prepending a 2-3 sentence context description to each
// chunk before embedding reduces retrieval failures by 49-67%.
//
// The parent chunk provides surrounding context; the child chunk is the passage
// to describe. The generated prefix is prepended to pageContent before indexing.
// The original text is stored in metadata.originalText for citation display.

"use strict";

const axios = require("axios");
const logger = require("../logger");

// Default cheap models for contextual retrieval (minimize cost per chunk)
const DEFAULT_MODELS = {
  gemini: "gemini-2.0-flash-lite",
  openai: "gpt-4o-mini",
  ollama: process.env.OLLAMA_LLM_MODEL || "llama3.2",
};

const CONCURRENCY = 5; // max parallel LLM calls during ingestion

function buildPrompt(documentTitle, parentText, childText) {
  const parentSnippet = parentText.slice(0, 800);
  const childSnippet = childText.slice(0, 600);
  return (
    `You are a document analysis assistant. Provide a brief contextual description of a text passage.\n\n` +
    `Document: ${documentTitle}\n` +
    `Surrounding context:\n${parentSnippet}\n\n` +
    `Passage to describe:\n${childSnippet}\n\n` +
    `In 2-3 sentences, describe what this passage is about and how it fits into the broader document. ` +
    `Reply with only the description — no preamble, no labels, no formatting.`
  );
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const model = DEFAULT_MODELS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 200, temperature: 0 },
    },
    { timeout: 30000 }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text.trim();
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: DEFAULT_MODELS.openai,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 30000,
    }
  );

  return response.data.choices[0].message.content.trim();
}

async function callOllama(prompt) {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
  const model = DEFAULT_MODELS.ollama;

  const response = await axios.post(
    `${ollamaUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: { num_predict: 200, temperature: 0 },
    },
    { timeout: 60000 }
  );

  const text = response.data?.response;
  if (!text) throw new Error("Empty response from Ollama");
  return text.trim();
}

/**
 * Generates a 2-3 sentence contextual prefix for a single child chunk.
 *
 * @param {object} opts
 * @param {string} opts.provider          - "gemini" | "openai" | "ollama"
 * @param {string} opts.parentText        - Full text of the parent chunk (context)
 * @param {string} opts.childText         - Text of the child chunk to describe
 * @param {string} opts.documentTitle     - Document filename / title
 * @returns {Promise<string|null>}         - The context prefix, or null on failure
 */
async function generateContextPrefix({ provider, parentText, childText, documentTitle }) {
  const prompt = buildPrompt(documentTitle, parentText, childText);

  try {
    if (provider === "gemini") return await callGemini(prompt);
    if (provider === "openai") return await callOpenAI(prompt);
    if (provider === "ollama") return await callOllama(prompt);
    throw new Error(`Unknown contextual retrieval provider: ${provider}`);
  } catch (err) {
    logger.warn(
      `[ContextualRetrieval] Failed to generate context prefix (${provider}): ${err.message}`
    );
    return null; // non-fatal — chunk is indexed without prefix
  }
}

/**
 * Applies contextual prefixes to all child chunks in place.
 * Processes up to CONCURRENCY chunks in parallel to balance speed vs API rate limits.
 *
 * @param {object[]} childChunks   - Child LangChain Document objects (mutated in place)
 * @param {Map}      parentTextMap - Map<parentId, parentPageContent>
 * @param {string}   provider      - LLM provider for context generation
 * @param {string}   documentTitle - Source document filename
 */
async function applyContextualPrefixes(childChunks, parentTextMap, provider, documentTitle) {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < childChunks.length; i += CONCURRENCY) {
    const batch = childChunks.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (chunk) => {
        const parentText = parentTextMap.get(chunk.metadata.parentId) || "";
        // Use originalText (pre-header) for the child description prompt
        const childText = chunk.metadata.originalText || chunk.pageContent;

        const prefix = await generateContextPrefix({
          provider,
          parentText,
          childText,
          documentTitle,
        });

        if (prefix) {
          chunk.metadata.contextualPrefix = prefix;
          // Prepend: context prefix → header → original text
          chunk.pageContent = `${prefix}\n\n${chunk.pageContent}`;
          successCount++;
        } else {
          failCount++;
        }
      })
    );
  }

  return { successCount, failCount };
}

module.exports = { generateContextPrefix, applyContextualPrefixes };
