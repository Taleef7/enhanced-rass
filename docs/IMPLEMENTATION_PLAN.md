# RASS Enhancement Plan — Implementation Tracker

Last updated: 2026-03-17

---

## Phase 1: Critical Fixes — Zero Architectural Risk

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 1.1 | Config tuning: LLM_MAX_TOKENS 8192, DEFAULT_TOP_K 10, RERANK_PROVIDER cohere, RERANK_TOP_N 10, CHILD_CHUNK_SIZE 500, CHILD_CHUNK_OVERLAP 150, HYDE_ENABLED true | `config.yml`, `config.example.yml` | ✅ Done |
| 1.2 | Per-KB index routing (correctness bug fix) | `HybridSearchStage.js`, `askSchema.js`, `context.js`, `streamAsk.js` (rass-engine route) | ✅ Done |
| 1.3 | HyDE implementation bug fix (embed hypo doc separately; use for KNN only) | `HydeQueryExpansionStage.js`, `EmbedQueryStage.js` | ✅ Done |
| 1.4 | Lost-in-middle chunk reordering | `TopKSelectStage.js` | ✅ Done |
| 1.5 | Token budget enforcement (prevent context overflow) | `generator.js`, `streaming.js` | ✅ Done |
| 1.6 | FeedbackBoost in-process caching (5-min TTL, eliminates 2 HTTP calls/query) | `FeedbackBoostStage.js` | ✅ Done |
| 1.7 | Inline [N] citation markers in system prompt | `generator.js` | ✅ Done |

---

## Phase 2: RAG Pipeline Improvements

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 2.1 | Conversational query reformulation stage | `QueryReformulationStage.js` (new), `createPipeline.js`, `mcp-server/proxy/streamAsk.js`, `mcp-server/schemas/streamAskSchema.js`, `rass-engine/schemas/askSchema.js`, `rass-engine/retrieval/context.js` | ✅ Done |
| 2.2 | OpenSearch RRF (Reciprocal Rank Fusion) hybrid search normalization | `HybridSearchStage.js` | ⬜ Todo |
| 2.3 | Contextual chunk headers (free BM25 win — prepend Document/Section/Page before embedding) | `ingestionWorker.js` | ✅ Done |

---

## Phase 3: Anthropic Contextual Retrieval + Re-indexing

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 3.1 | LLM-generated context prefix per child chunk at ingestion | `ingestionWorker.js`, `configSchema.js`, `config.js` | ⬜ Todo |
| 3.2 | Re-index all documents endpoint | `mcp-server/src/routes/admin.js` | ⬜ Todo |

**Config flags added (off by default):**
- `CONTEXTUAL_RETRIEVAL_ENABLED: false`
- `CONTEXTUAL_RETRIEVAL_PROVIDER: "gemini"`

---

## Phase 4: User Memory System

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 4.1 | `rass-user-memories` OpenSearch index schema | New OS index | ⬜ Todo |
| 4.2 | Async memory extraction after each assistant turn | `mcp-server/src/chatRoutes.js` | ⬜ Todo |
| 4.3 | Memory injection at query time | `QueryReformulationStage.js` or new `MemoryInjectionStage.js` | ⬜ Todo |
| 4.4 | Memory management REST API | `mcp-server/src/routes/memories.js` (new) | ⬜ Todo |

---

## Phase 5: OpenWebUI Migration (OpenAI-compatible adapter)

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 5.1 | `POST /v1/chat/completions` adapter endpoint | `mcp-server/src/routes/openaiCompat.js` (new) | ⬜ Todo |
| 5.2 | Per-user API key management for model selection | `mcp-server/src/routes/apiKeys.js` | ⬜ Todo |
| 5.3 | OpenWebUI service in Docker Compose | `docker-compose.yml` | ⬜ Todo |
| 5.4 | OpenWebUI admin configuration | Manual / docker env | ⬜ Todo |

---

## Phase 6: LightRAG Graph Layer

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 6.1 | Prisma schema: Entity + Relation models | `mcp-server/prisma/schema.prisma` | ⬜ Todo |
| 6.2 | Entity extraction at ingestion | `ingestionWorker.js` | ⬜ Todo |
| 6.3 | Graph expansion retrieval stage | `GraphExpansionStage.js` (new), `createPipeline.js` | ⬜ Todo |
| 6.4 | Graph query REST API | `mcp-server/src/routes/knowledgeGraphAPI.js` (new) | ⬜ Todo |

**Config flags added (off by default):**
- `GRAPH_EXTRACTION_ENABLED: false`
- `GRAPH_EXPANSION_ENABLED: false`

---

## Phase 7: MCP Tool Expansion

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 7.1 | New MCP tools: webSearch, listDocuments, getDocumentSummary, searchMemories, queryKnowledgeGraph, listKnowledgeBases | `mcp-server/src/gateway/mcpTools.js` | ⬜ Todo |
| 7.2 | Web search as retrieval fallback (CRAG-lite) | `WebSearchFallbackStage.js` (new), `createPipeline.js` | ⬜ Todo |
| 7.3 | True MCP protocol JSON-RPC endpoint at `/mcp` | `mcp-server/src/server.js` or new `mcpProtocol.js` | ⬜ Todo |

**Config flags added (off by default):**
- `WEB_SEARCH_ENABLED: false`
- `WEB_SEARCH_PROVIDER: "tavily"`
- `WEB_SEARCH_THRESHOLD: 0.3`

---

## Phase 8: Citation UX Changes

| # | Item | File(s) | Status |
|---|------|---------|--------|
| 8.1 | Remove Evidence Trace tab from frontend (handled by OpenWebUI) | `frontend/src/components/ContextPanel.js`, `frontend/src/Chat.js` | ⬜ Todo |
| 8.2 | Top-K citation count user control (settings popover in ChatInput) | `frontend/src/components/ChatInput.js` | ⬜ Todo |

---

## Summary

| Phase | Items | Done | Remaining |
|-------|-------|------|-----------|
| 1 (Critical Fixes) | 7 | 7 | 0 |
| 2 (RAG Pipeline) | 3 | 2 | 1 (RRF) |
| 3 (Contextual Retrieval) | 2 | 0 | 2 |
| 4 (User Memory) | 4 | 0 | 4 |
| 5 (OpenWebUI) | 4 | 0 | 4 |
| 6 (LightRAG) | 4 | 0 | 4 |
| 7 (MCP Tools) | 3 | 0 | 3 |
| 8 (Citation UX) | 2 | 0 | 2 |
| **Total** | **29** | **9** | **20** |

---

## Verification Checklist

### Phase 1 (no re-index required)
- [ ] `cd rass-engine-service && npm test` — all pipeline tests pass
- [ ] Manual: long query returns response > 2048 tokens
- [ ] Manual: two different KB IDs return docs from different indices (no cross-contamination)
- [ ] Jaeger traces: FeedbackBoostStage latency drops ~200–400ms per query (cache hit)
- [ ] Manual: follow-up "what about cost?" returns reformulated standalone query in logs
- [ ] Manual: citations show [1], [2] inline in response text

### Phase 2-3 (after re-index)
- [ ] Manual: ask "and what did it say about revenue?" — logs show reformulated query
- [ ] Manual: ingestion logs show contextual chunk headers prepended
- [ ] Manual: compare retrieval quality before/after contextual retrieval on same queries

### Phase 4 (memory)
- [ ] `GET /api/memories` returns facts extracted from test conversations
- [ ] New conversation references past fact extracted from previous session

### Phase 5 (OpenWebUI)
- [ ] `curl -X POST http://localhost:8080/v1/chat/completions -d '{"model":"rass","messages":[{"role":"user","content":"test"}],"stream":true}'`
- [ ] OpenWebUI at `:3000` shows RASS as available model

### Phase 6 (LightRAG)
- [ ] After ingestion with `GRAPH_EXTRACTION_ENABLED: true`, `GET /api/graph/entities` returns entities
- [ ] Multi-hop query returns graph-expanded docs not in vector results

### Phase 7 (Tools)
- [ ] `/mcp` JSON-RPC `tools/list` returns all tool schemas
- [ ] `webSearch` tool returns live results via Tavily

---

## Impact Summary

| Metric | Before | After Phase 1+2 |
|--------|--------|-----------------|
| Answer quality | Reranking off, 50 chunks, 2048 token cap | Reranking on (Cohere), 10 best chunks, 8192 tokens |
| Retrieval: per-KB isolation | Broken (all users share one index) | Fixed — per-KB OpenSearch index |
| HyDE effectiveness | Concatenated (diluted signal) | Separate KNN embedding (correct) |
| Conversational UX | Each query independent | Follow-ups reformulated with history |
| Context window usage | Unbounded (could overflow) | Token-budget-enforced |
| FeedbackBoost latency | ~300ms per query (2 HTTP calls) | <1ms (in-process cache) |
| Inline citations | None | [N] markers with document references |
| BM25 recall | Raw chunk text only | Chunk text + Document/Section/Page header |
