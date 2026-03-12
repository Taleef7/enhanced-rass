# RASS Engine Service

`rass-engine-service` is the retrieval and generation backend.

## Endpoints

- `GET /` -> basic status
- `POST /ask` -> non-streaming answer generation
- `POST /stream-ask` -> SSE streaming answer generation
- `GET /metrics` -> Prometheus metrics

## Current retrieval path

The active streaming path uses the staged pipeline assembled in `src/retrieval/createPipeline.js`:

1. `HydeQueryExpansionStage`
2. `EmbedQueryStage`
3. `HybridSearchStage`
4. `ParentFetchStage`
5. `DeduplicateStage`
6. `RerankStage`
7. `FeedbackBoostStage`
8. `TopKSelectStage`

The older "agentic planner" description is no longer the right description of the current engine.

## Streaming behavior

`POST /stream-ask` emits OpenAI-style SSE chunks:

1. retrieved `context`
2. token deltas
3. structured `citations`
4. `[DONE]`

## Config

Loaded from the repo-root `config.yml`:

- `RASS_ENGINE_PORT`
- `LLM_PROVIDER`
- `SEARCH_TERM_EMBEDDING_PROVIDER`
- `DEFAULT_K_OPENSEARCH_HITS`
- `HYDE_ENABLED`
- `RERANK_PROVIDER`
- `FEEDBACK_BOOST_ENABLED`
- `OPENSEARCH_INDEX_NAME`

Secrets come from environment variables such as:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

## Important caveats

- `POST /ask` still uses the simpler non-pipeline retrieval path.
- `HybridSearchStage` currently searches the configured default OpenSearch index rather than dynamically switching to KB/workspace indices.
- The OpenAI-compatible `/api/chat/completions` flow is proxied through `mcp-server` and is intentionally unscoped.
