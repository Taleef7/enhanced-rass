# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

CoRAG is a multi-service RAG (Retrieval-Augmented Generation) platform. Four services communicate over a shared Docker network (`shared_rass_network`):

```
Browser → mcp-server :8080 → rass-engine-service :8000 → OpenSearch :9200
                           → embedding-service :8001 → Redis :6379
                           → Postgres :5432 (via Prisma)
```

- **`mcp-server`** — Express 5 API gateway: auth (JWT + refresh-token cookies), chat/document/KB REST API, Prisma ORM for Postgres, proxies uploads to `embedding-service` and streaming queries to `rass-engine-service`. Uses CommonJS.
- **`rass-engine-service`** — Staged retrieval pipeline (`HydeQueryExpansion → EmbedQuery → HybridSearch → ParentFetch → Deduplicate → Rerank → FeedbackBoost → TopKSelect`) then LLM generation. Streams SSE: `context` → token deltas → `citations` → `[DONE]`. Uses CommonJS.
- **`embedding-service`** — Accepts uploads, enqueues BullMQ jobs (Redis), worker flow: parse → chunk → embed → index → provenance callback. Stores parent chunks in Redis, child chunks in OpenSearch. Uses CommonJS.
- **`frontend`** — React 19 + MUI SPA. In-memory JWT state + HTTP-only refresh-token cookie. **Not included in the root Docker Compose stack** — run separately for local UI work.

## Configuration

`config.yml` (copy from `config.example.yml`) holds non-secret runtime config for all three backend services. All services validate it with Zod on startup and exit on invalid config. Secrets go in `.env` only.

Key config choices: `EMBEDDING_PROVIDER`, `LLM_PROVIDER`, `SEARCH_TERM_EMBEDDING_PROVIDER` — each accepts `"openai"`, `"gemini"`, or `"ollama"`.

## Development Commands

### Backend stack (Docker)
```bash
# One-time setup
docker network create shared_rass_network

./scripts/start.sh   # docker-compose up -d --build
./scripts/stop.sh    # stop and remove stack
```

`mcp-server` runs `npx prisma migrate deploy` on boot.

### Frontend (local)
```bash
cd frontend
npm install
npm start   # talks to http://localhost:8080/api
```

### Per-service
```bash
# Tests (Jest)
cd mcp-server && npm test
cd rass-engine-service && npm test
cd embedding-service && npm test
cd frontend && npm test   # React Testing Library via react-scripts

# OpenAPI validation (run after any route or contract change)
cd mcp-server && npm run validate:api

# Build frontend
cd frontend && npm run build
```

Backend tests live under `src/__tests__/*.test.js`. When retrieval, ingestion, or generation behavior changes, also run the evaluation tooling in `evaluation/`.

## Code Style

- 2-space indentation throughout.
- Backend services: CommonJS (`require`/`module.exports`).
- Frontend: ES modules with React function components.
- React components: PascalCase (`DocumentManager.js`). Utilities and route modules: camelCase (`authMiddleware.js`).
- Input validation with Zod across all services.
- Commits follow Conventional Commits: `feat:`, `fix:`, `docs:`, `ci:`.

## Key Known Limitations

- The active `HybridSearchStage` searches the default OpenSearch index; per-KB/workspace index switching is not yet wired.
- Shared-chat route selects `role`/`content` but Prisma `Message` model uses `sender`/`text` — treat shared chats as incomplete.
- Document deletion is soft-delete + best-effort OpenSearch cleanup; Redis parent chunks are not purged.
- Two distinct "knowledge graph" concepts exist: the older document-similarity graph in `knowledgeBases.js` and the newer entity/relation graph in `knowledgeGraph.js`.

## Observability URLs (local)

| URL | Purpose |
|-----|---------|
| `http://localhost:8080/api/health` | API health |
| `http://localhost:8080/api/docs` | Swagger UI |
| `http://localhost:8001/admin/queues` | Bull Board (ingestion queue) |
| `http://localhost:16686` | Jaeger traces |
| `http://localhost:9090` | Prometheus |
| `http://localhost:3001` | Grafana dashboards |
