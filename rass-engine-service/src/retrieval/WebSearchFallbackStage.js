// rass-engine-service/src/retrieval/WebSearchFallbackStage.js
// Phase 7.2: CRAG-lite web search fallback stage.
//
// Runs after TopKSelectStage as a final retrieval safety net.
// When WEB_SEARCH_ENABLED is true and the top-ranked chunk's score is below
// WEB_SEARCH_THRESHOLD, calls the Tavily web search API and injects web
// results as additional context chunks with source="web" metadata.
//
// Web results are injected BEFORE the existing KB chunks in context.documents
// so the LLM sees them first. The generator already cites [N] by position,
// so web results get their own [N] markers citing the web URL.
//
// Config flags (all off by default):
//   WEB_SEARCH_ENABLED: false
//   WEB_SEARCH_PROVIDER: "tavily"
//   WEB_SEARCH_THRESHOLD: 0.3   — invoke search if top score < this

"use strict";

const axios = require("axios");
const logger = require("../logger");
const { withSpan } = require("../tracing");

const TAVILY_API_URL = "https://api.tavily.com/search";
const MAX_WEB_RESULTS = 3;  // never exceed 3 web results to keep context focused
const WEB_RESULT_MAX_CHARS = 600; // truncate long web snippets

class WebSearchFallbackStage {
  constructor(config) {
    this.enabled = config.WEB_SEARCH_ENABLED || false;
    this.provider = config.WEB_SEARCH_PROVIDER || "tavily";
    this.threshold = config.WEB_SEARCH_THRESHOLD ?? 0.3;
  }

  async run(context) {
    if (!this.enabled) return;

    // Check if top chunk score meets the threshold
    const docs = context.documents || [];
    const topScore = docs.length > 0 ? (docs[0].score ?? 1.0) : 1.0;

    if (topScore >= this.threshold) {
      logger.info(
        `[WebSearchFallbackStage] Top chunk score ${topScore.toFixed(3)} >= threshold ${this.threshold} — skipping web search`
      );
      return;
    }

    const query = context.reformulatedQuery || context.query;
    logger.info(
      `[WebSearchFallbackStage] Top score ${topScore.toFixed(3)} < ${this.threshold} — triggering ${this.provider} web search for: "${query.slice(0, 80)}"`
    );

    await withSpan("retrieval.webSearchFallback", { "query.text": query.slice(0, 80) }, async () => {
      try {
        const webResults = await this._search(query);
        if (webResults.length === 0) return;

        // Build context chunks from web results
        const webChunks = webResults.map((r, i) => ({
          pageContent: r.content,
          score: r.score || 0.1,
          metadata: {
            source: "web",
            originalFilename: r.title || `Web Result ${i + 1}`,
            url: r.url,
            parentId: `web-${i}`,
            documentId: null,
          },
        }));

        // Prepend web results to existing documents (they are cited first)
        context.documents = [...webChunks, ...docs];
        context.webSearchUsed = true;

        logger.info(
          `[WebSearchFallbackStage] Injected ${webChunks.length} web results into context`
        );
      } catch (err) {
        logger.warn(`[WebSearchFallbackStage] Web search failed: ${err.message}`);
      }
    });
  }

  async _search(query) {
    if (this.provider === "tavily") {
      return this._tavilySearch(query);
    }
    logger.warn(`[WebSearchFallbackStage] Unknown web search provider: ${this.provider}`);
    return [];
  }

  async _tavilySearch(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      logger.warn("[WebSearchFallbackStage] TAVILY_API_KEY not set — skipping web search");
      return [];
    }

    const response = await axios.post(
      TAVILY_API_URL,
      {
        api_key: apiKey,
        query,
        max_results: MAX_WEB_RESULTS,
        search_depth: "basic",
        include_answer: false,
      },
      { timeout: 10000 }
    );

    const results = response.data?.results || [];
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      content: (r.content || r.snippet || "").slice(0, WEB_RESULT_MAX_CHARS),
      score: r.score || 0.1,
    }));
  }
}

module.exports = { WebSearchFallbackStage };
