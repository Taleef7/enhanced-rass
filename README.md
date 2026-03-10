# RASS (Retrieval-Augmented Semantic Search)

A production-grade, multi-service Retrieval Augmented Generation (RAG/RASS) system with document ingestion, hybrid retrieval, SSE streaming, and a polished React frontend. It’s built for clarity and reproducibility: one configuration file, containerized services, and sensible defaults.

## What you get

- Multi-provider embeddings (OpenAI or Gemini) with correct vector dimensioning
- Hybrid retrieval over OpenSearch (KNN + keyword) scoped per-user
- Redis-backed parent-doc store for fast parent retrieval
- Postgres + Prisma for auth and chats
- MCP gateway with REST endpoints and OpenAI-compatible stream proxy
- React frontend with uploads, chat, streaming citations, and document viewer

See deep-dive diagrams and flows in docs/PLANNER_AND_DIAGRAMS.md.

---

## Architecture at a glance

Services (all configured from root config.yml and secrets from .env):
- embedding-service (8001): ingest → split to parent/child → embed → index child chunks in OpenSearch index knowledge_base and store parents in Redis.
- rass-engine-service (8000): retrieve via hybrid search + generate answer via LLM; SSE or JSON.
- mcp-server (8080): gateway. REST auth and chat CRUD, stream proxy, upload proxy, and MCP /mcp tools.
- frontend (8080 via proxy): CRA app that talks to mcp-server.
- Infra: OpenSearch, Redis, Postgres (via Docker Compose).

Data rules:
- All searches are strictly filtered by metadata.userId.
- Parent chunks live in Redis keyed by UUID; child chunks are in OpenSearch with metadata including userId, originalFilename, uploadedAt, parentId.
- Chats/messages are in Postgres. The frontend token is stored as authToken in localStorage.

---

## Quickstart

1) Prereqs
- Docker and Docker Compose
- Increase vm.max_map_count for OpenSearch (Linux/WSL): sudo sysctl -w vm.max_map_count=262144
- Create the external network once: docker network create shared_rass_network

2) Configure secrets and providers
- Copy or create a .env in the repo root with: OPENAI_API_KEY, GEMINI_API_KEY, JWT_SECRET, DATABASE_URL if needed.
- Choose providers in config.yml: EMBEDDING_PROVIDER, LLM_PROVIDER, SEARCH_TERM_EMBEDDING_PROVIDER. Ensure EMBED_DIM matches the embedding model (e.g., Gemini 768, OpenAI text-embedding-3-large 3072).

3) Start the stack
- scripts/start.sh (docker-compose up -d --build). First boot runs Prisma migrate deploy in mcp-server and creates OpenSearch index if missing.

4) Open the app
- Frontend via http://localhost:8080 (proxied). Register then login; token persists in localStorage.

5) Try it
- Create a chat, upload a document (paper.pdf, txt, md, docx) using the paperclip in the input.
- Ask a question; watch SSE stream and citations.
- “Your Documents” shows aggregated uploads for the logged-in user.

---

## Configuration

- config.yml (root, mounted into services):
  - OPENSEARCH_* host/port/index, REDIS_* host/db, provider names, chunk sizes, EMBED_DIM, default K values.
  - Changing providers? Keep EMBED_DIM in sync or delete/recreate the OpenSearch index.
- .env (root): OPENAI_API_KEY, GEMINI_API_KEY, JWT_SECRET, DATABASE_URL. Compose passes these to services.

Provider pairing tips:
- Gemini text-embedding-004 → EMBED_DIM: 768
- OpenAI text-embedding-3-large → EMBED_DIM: 3072
- Change both the model and EMBED_DIM together; reindex after changing.

---

## API map (selected)

- Frontend → mcp-server (all require Bearer unless noted)
  - POST /api/auth/register, /api/auth/login
  - GET /api/chats, GET /api/chats/:chatId
  - POST /api/chats, PATCH /api/chats/:chatId, DELETE /api/chats/:chatId
  - POST /api/chats/:chatId/messages, PATCH/DELETE specific messages
  - POST /api/embed-upload (form field file) → forwards to embedding-service /upload with userId
  - POST /api/stream-ask → proxies SSE to rass-engine-service /stream-ask; injects userId; returns OpenAI-style SSE frames with choices[0].delta.content and delta.custom_meta.citations
  - GET /api/user-documents → aggregates user’s chunk metadata from OpenSearch
  - POST /api/chat/completions → LibreChat-compatible stream proxy to engine
- embedding-service
  - POST /upload (multipart files[], userId), POST /get-documents (ids[]), GET /health
- rass-engine-service
  - POST /ask (JSON), POST /stream-ask (SSE; requires userId)
- MCP /mcp
  - Tools: queryRASS (→ engine /ask), addDocumentToRASS (→ embedding /upload)

---

## Frontend

- CRA app under frontend/. Token stored as authToken.
- Welcome screen simplified; chat list with rename/delete; streaming placeholder is local-only to avoid duplicate persisted messages.
- Your Documents modal calls GET /api/user-documents. If it fails, check JWT validity.

Local dev only (optional):
- cd frontend && npm install && npm start
- The dev server proxies to 8080 for API calls.

---

## Data model (Prisma)

- User(id, username, password hash, timestamps)
- Chat(id, title, userId, messages[], documents[])
- Message(id, text, sender, chatId, sources JSON, createdAt)
- ChatDocument(id, name, size?, chatId, uploadedAt)

DB connection string is provided via DATABASE_URL; migrations run on mcp-server boot.

---

## Operations & Troubleshooting

- Create the external docker network if missing: docker network create shared_rass_network
- OpenSearch health: curl http://localhost:9200/_cluster/health
- vm.max_map_count must be ≥ 262144; otherwise OpenSearch may fail silently or query performance degrades.
- Index dimension mismatch: If you change embedding model/dimension, recreate the index (embedding-service ensures creation with the configured dimension).
- JWT expired in logs? Re-login; frontend will keep using old token until you log out/in. The Your Documents modal requires a valid token.
- Uploads appear in engine answers but not in Your Documents: ensure /api/user-documents reachable and your token is valid; mcp-server aggregates by metadata.originalFilename/metadata.source.
- Redis docstore stats: GET http://localhost:8001/docstore/stats

---

## Evaluation

- evaluation/ contains a TruLens-based evaluator (Python). See evaluation/requirements.txt, run evaluate.py against your engine endpoints. Useful for regression checks and measuring recall/faithfulness.

---

## Contributing

- Keep config keys aligned across services.
- Prefer small, focused PRs. Update docs when changing public behavior.
- Add/adjust tests or evaluation harnesses when modifying retrieval logic.

## License

MIT (supply your own license text if different).

---

## Service Module Structure (Phase A Refactoring)

Each service has been refactored into a layered module structure for maintainability, testability, and clear separation of concerns. The service entry points (`index.js`) are now thin orchestrators (~20-30 lines) that import modules from `src/`.

### embedding-service/src/
```
src/
  config.js                  ← validated config loading (exits on bad/missing fields)
  clients/
    redisClient.js            ← Redis client, connection handlers, docstore state
    opensearchClient.js       ← OpenSearch client + ensureIndexExists()
    embedder.js               ← embedding provider factory (OpenAI / Gemini)
  store/
    redisDocumentStore.js     ← RedisDocumentStore class (LangChain BaseStore)
  ingestion/
    parser.js                 ← file-type detection + document loaders (PDF/DOCX/TXT)
    chunker.js                ← pre-configured parent/child text splitters
  routes/
    upload.js                 ← POST /upload
    documents.js              ← POST /get-documents, GET /docstore/stats
    admin.js                  ← POST /clear-docstore
    health.js                 ← GET /health
  __tests__/
    config.test.js            ← unit tests for config loading and validation
```

### rass-engine-service/src/
```
src/
  config.js                  ← validated config loading
  clients/
    llmClient.js              ← LLM client factory (OpenAI / Gemini)
    embedder.js               ← search-term embedding + embedText() function
    opensearchClient.js       ← OpenSearch client
  planner/
    searchPlanner.js          ← createRefinedSearchPlan() — LLM-based query expansion
    hydeGenerator.js          ← HyDE hypothetical document generation
  retrieval/
    simpleSearch.js           ← hybrid KNN + keyword search with user-scope filter
    executePlan.js            ← multi-step plan execution + parent-doc fetch
  generation/
    generator.js              ← non-streaming LLM answer generation
    streaming.js              ← writeSSE() + streaming generation pipeline
  routes/
    ask.js                    ← POST /ask
    streamAsk.js              ← POST /stream-ask (SSE)
  schemas/                    ← reserved for Phase A 2.2 / 2.3 Zod schemas
  __tests__/
    config.test.js
```

### mcp-server/src/
```
src/
  config.js                  ← validated config loading
  authRoutes.js              ← (unchanged) POST /api/auth/register, /login
  authMiddleware.js          ← (unchanged) JWT Bearer auth middleware
  chatRoutes.js              ← (unchanged) CRUD for /api/chats
  proxy/
    embedUpload.js            ← POST /api/embed-upload → embedding-service
    streamAsk.js              ← POST /api/stream-ask  → rass-engine-service (SSE)
    chatCompletions.js        ← POST /api/chat/completions (OpenAI-compat proxy)
    userDocuments.js          ← GET /api/user-documents (OpenSearch aggregation)
    transcribe.js             ← POST /api/transcribe (Whisper)
  gateway/
    mcpTools.js               ← MCP tool definitions (queryRASS, addDocumentToRASS)
    mcpTransport.js           ← POST /mcp (StreamableHTTPServerTransport)
  __tests__/
    config.test.js
```

### Centralized Configuration (config.yml)
All services load and validate `config.yml` at startup via `src/config.js`. A missing or incorrectly-typed required field causes an immediate, descriptive error (with the field name) before the server binds a port — no more silent `undefined` propagating into service logic.

Run unit tests for config validation:
```bash
cd embedding-service && npm test
cd rass-engine-service && npm test
cd mcp-server && npm test
```
