// rass-engine-service/src/retrieval/GraphExpansionStage.js
// Phase 6.3: LightRAG graph expansion retrieval stage.
//
// Inserts after HybridSearchStage, before DeduplicateStage.
// When GRAPH_EXPANSION_ENABLED is true, extracts key terms from the query,
// queries the knowledge graph for related entities and their document IDs,
// then fetches parent chunks for those documents from Redis and merges them
// with the existing vector-retrieved chunks.
//
// This enables multi-hop reasoning: a query about "company X" can surface
// documents about its subsidiaries, founders, or related products even if
// those documents don't contain the exact query terms.

"use strict";

const axios = require("axios");
const logger = require("../logger");
const { withSpan } = require("../tracing");

const MCP_SERVER_INTERNAL_URL =
  process.env.MCP_SERVER_URL || "http://mcp-server:8080";

const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const internalHeaders = INTERNAL_SERVICE_TOKEN
  ? { "x-internal-token": INTERNAL_SERVICE_TOKEN }
  : {};

// Extract key noun phrases / significant words from query for entity lookup.
// Avoids stop words and short tokens to reduce noise.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "what", "who", "when", "where", "how", "which", "that", "this", "these",
  "those", "it", "its", "can", "could", "would", "should", "will", "do",
  "does", "did", "has", "have", "had", "not", "no", "any", "all", "about",
]);

function extractSearchTerms(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 6); // limit to top-6 terms to keep the graph query focused
}

class GraphExpansionStage {
  constructor(config) {
    this.enabled = config.GRAPH_EXPANSION_ENABLED || false;
    this.topK = config.GRAPH_EXPANSION_TOP_K || 5;
  }

  async run(context) {
    if (!this.enabled) return context;

    const query = context.reformulatedQuery || context.query;
    const kbId = context.kbId;

    if (!kbId) {
      // Graph expansion requires a KB scope — skip silently
      return context;
    }

    await withSpan("retrieval.graphExpansion", { "query.kbId": kbId }, async () => {
      try {
        const terms = extractSearchTerms(query);
        if (terms.length === 0) return;

        logger.info(
          `[GraphExpansionStage] Querying graph for terms: [${terms.join(", ")}] in kbId=${kbId}`
        );

        // Ask mcp-server for entity neighbors matching our query terms
        const response = await axios.get(
          `${MCP_SERVER_INTERNAL_URL}/internal/graph/neighbors`,
          {
            params: { kbId, terms: terms.join(","), limit: 20 },
            headers: internalHeaders,
            timeout: 5000,
          }
        );

        const { documentIds = [] } = response.data;
        if (documentIds.length === 0) return;

        logger.info(
          `[GraphExpansionStage] Graph found ${documentIds.length} related document IDs`
        );

        // Store graph-sourced document IDs on context for ParentFetchStage to pick up.
        // ParentFetchStage already fetches parent docs — we just extend its input set.
        // We inject them as additional hits with a marker so they can be identified.
        if (!context.graphDocumentIds) {
          context.graphDocumentIds = [];
        }
        context.graphDocumentIds.push(...documentIds.slice(0, this.topK));

        // Inject placeholder hits that ParentFetchStage can resolve to parent chunks.
        // Use a synthetic hit structure matching what HybridSearchStage produces.
        const graphHits = documentIds.slice(0, this.topK).map((docId) => ({
          _score: 0.01, // low synthetic score — reranker will re-score
          _source: {
            metadata: { documentId: docId, graphExpanded: true },
            text: "",
          },
        }));

        // Merge with existing hits (deduplication happens in DeduplicateStage)
        if (!context.hits) {
          context.hits = [];
        }
        context.hits.push(...graphHits);

        logger.info(
          `[GraphExpansionStage] Injected ${graphHits.length} graph-expanded hits`
        );
      } catch (err) {
        // Graph expansion is non-fatal — log and continue
        logger.warn(`[GraphExpansionStage] Error: ${err.message}`);
      }
    });

    return context;
  }
}

module.exports = { GraphExpansionStage };
