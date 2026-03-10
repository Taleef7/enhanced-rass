# RASS (Retrieval-Augmented Semantic Search)

A production-grade, multi-service Retrieval Augmented Generation (RAG/RASS) system with document ingestion, hybrid retrieval, SSE streaming, and a polished React frontend. It's built for clarity and reproducibility: one configuration file, containerized services, and sensible defaults.

## What you get

- Multi-provider embeddings (OpenAI or Gemini) with correct vector dimensioning
- **Async document ingestion** via BullMQ job queue (no more HTTP timeouts on large files)
- **Document registry** with lifecycle tracking (QUEUED → PROCESSING → READY → FAILED)
- **ETL provenance** records for every ingested document (SHA-256, stage timings, chunking config, embedding model)
- **Configurable chunking strategies**: `fixed_size`, `recursive_character`, `sentence_window` — selectable via `config.yml`
- **Bring-Your-Own Knowledge Base (BYO KB)**: per-user/team knowledge bases with dedicated OpenSearch indices
- Hybrid retrieval over OpenSearch (KNN + keyword) scoped per-user / per-KB
- Redis-backed parent-doc store for fast parent retrieval
- Postgres + Prisma for auth, chats, and document registry
- MCP gateway with REST endpoints and OpenAI-compatible stream proxy
- React frontend with uploads, live progress polling, document library with status badges, streaming citations

See deep-dive diagrams and flows in docs/PLANNER_AND_DIAGRAMS.md.

---

## Architecture at a glance

Services (all configured from root config.yml and secrets from .env):
- **embedding-service (8001)**: ingest → BullMQ queue → worker (parse → chunk → embed → index child chunks in OpenSearch + store parents in Redis) → provenance record.
- **rass-engine-service (8000)**: retrieve via hybrid search + generate answer via LLM; SSE or JSON.
- **mcp-server (8080)**: gateway. REST auth, chat CRUD, document registry API, KB management API, stream proxy, upload proxy, and MCP /mcp tools.
- **frontend (8080 via proxy)**: CRA app that talks to mcp-server.
- Infra: OpenSearch, Redis, Postgres (via Docker Compose).

Data rules:
- All searches are strictly filtered by metadata.userId (or KB membership).
- Parent chunks live in Redis keyed by UUID; child chunks are in OpenSearch with metadata including userId, originalFilename, uploadedAt, parentId, documentId, kbId.
- Chats/messages and the document registry are in Postgres. The frontend token is stored as authToken in localStorage.

---

## Quickstart

1) Prereqs
- Docker and Docker Compose
- Increase vm.max_map_count for OpenSearch (Linux/WSL): `sudo sysctl -w vm.max_map_count=262144`
- Create the external network once: `docker network create shared_rass_network`

2) Configure secrets and providers
- Copy or create a `.env` in the repo root with: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`.
- Choose providers in `config.yml`: `EMBEDDING_PROVIDER`, `LLM_PROVIDER`, `SEARCH_TERM_EMBEDDING_PROVIDER`. Ensure `EMBED_DIM` matches the embedding model (Gemini → 768, OpenAI text-embedding-3-large → 3072).
- Choose chunking strategy: `CHUNKING_STRATEGY: recursive_character` (default) | `fixed_size` | `sentence_window`.

3) Start the stack
- `scripts/start.sh` (docker-compose up -d --build). First boot runs `prisma migrate deploy` in mcp-server and creates OpenSearch index if missing.

4) Open the app
- Frontend via http://localhost:8080. Register then login.

5) Try it
- Create a chat, upload a document (.pdf, .txt, .md, .docx) using the paperclip in the input.
- The upload returns immediately (202 Accepted). Watch the live progress bar: Queued → Parsing → Chunking → Embedding → Ready.
- Go to "My Documents" to see all documents with status badges and ETL provenance.
- Ask a question; watch SSE stream and citations.

---

## Phase B Features

### #109 — Async Document Ingestion Pipeline
- **Upload now returns 202 immediately** with a `{ jobId, documentId }` payload.
- BullMQ worker processes jobs asynchronously: parse → chunk → embed → index.
- **Progress polling**: frontend polls `GET /api/ingest/status/:jobId` every 2 s; shows 0 → 25 → 50 → 75 → 100% with stage labels.
- **Automatic retries**: 3 attempts with exponential backoff (5 s, 10 s, 20 s) on failure.
- **Bull Board** at `http://localhost:8001/admin/queues` (non-production) — live queue/worker dashboard.

### #110 — ETL Provenance Tracking
- Every successfully ingested document gets a `DocumentProvenance` record in Postgres.
- Records: SHA-256 of raw file, chunking strategy + parameters, embedding model + dimension, page count, parent/child chunk counts, parse/chunk/embed/index stage durations.
- **Duplicate detection**: files with identical SHA-256 can be identified.
- `GET /api/documents/:id/provenance` — view full provenance for a document.
- All user actions (upload, delete, ingestion) are written to the `AuditLog` table with userId, timestamp, and outcome.

### #111 — Document Registry
- Centralised `Document` table in Postgres tracking the full lifecycle of every ingested document.
- Status transitions: `QUEUED → PROCESSING → READY` (or `FAILED` → retry → `READY`).
- `GET /api/documents` — paginated, filterable list of current user's documents.
- `GET /api/documents/:id` — single document metadata + provenance.
- `DELETE /api/documents/:id` — removes OpenSearch vectors and marks document DELETED.
- Frontend "My Documents" shows live status badges, chunk counts, provenance dialog, and delete with confirmation.

### #112 — Configurable Chunking Strategies

| Strategy | Key | Description |
|---|---|---|
| Fixed Size | `fixed_size` | Splits on a separator, each chunk ≤ `PARENT_CHUNK_SIZE` chars |
| Recursive Character | `recursive_character` | Tries `\n\n`, `\n`, ` `, `""` in order (default) |
| Sentence Window | `sentence_window` | Splits on sentence boundaries, groups into sliding windows |

```yaml
CHUNKING_STRATEGY: "recursive_character"   # fixed_size | recursive_character | sentence_window
PARENT_CHUNK_SIZE: 2000
PARENT_CHUNK_OVERLAP: 500
CHILD_CHUNK_SIZE: 200
CHILD_CHUNK_OVERLAP: 100
```

All 16 unit tests pass: `cd embedding-service && npm test`.

### #113 — Bring-Your-Own Knowledge Base (BYO KB)
- `POST /api/knowledge-bases` — create a named KB; automatically provisions a dedicated OpenSearch index.
- `GET /api/knowledge-bases` — list KBs you own, are a member of, or that are public.
- `DELETE /api/knowledge-bases/:id` — deletes the OpenSearch index and marks all documents DELETED.
- `POST /api/knowledge-bases/:id/members` — grant VIEWER / EDITOR / OWNER role to another user.
- Upload to a specific KB by passing `kbId` in the upload form.

---

## Configuration

- `config.yml` (root, mounted into services):
  - `OPENSEARCH_*` host/port/index, `REDIS_*` host/db, provider names, chunk sizes, `EMBED_DIM`.
  - **New in Phase B**: `CHUNKING_STRATEGY` — choose `fixed_size`, `recursive_character`, or `sentence_window`.
- `.env` (root): `OPENAI_API_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`.

Provider pairing tips:
- Gemini text-embedding-004 → `EMBED_DIM: 768`
- OpenAI text-embedding-3-large → `EMBED_DIM: 3072`

---

## API map (selected)

- Frontend → mcp-server (all require Bearer unless noted)
  - `POST /api/auth/register`, `/api/auth/login`
  - `GET /api/chats`, `POST /api/chats`, `PATCH/DELETE /api/chats/:id`
  - `POST /api/embed-upload` → returns 202 with `{ documentId, jobs: [{ jobId }] }`
  - `GET /api/ingest/status/:jobId` → `{ status, progress, result }` (poll every 2 s)
  - `POST /api/stream-ask` → SSE stream with citations
  - `GET /api/documents` → paginated document registry list
  - `DELETE /api/documents/:id` → delete document
  - `GET /api/documents/:id/provenance` → ETL provenance record
  - `GET /api/knowledge-bases` → list accessible KBs
  - `POST /api/knowledge-bases` → create KB
  - `DELETE /api/knowledge-bases/:id` → delete KB
- embedding-service internal
  - `POST /upload` → enqueues async ingestion job, returns `{ jobs: [{ jobId, documentId }] }`
  - `GET /ingest/status/:jobId` → BullMQ job status
  - `GET /admin/queues` → Bull Board UI (dev only)
- Internal service-to-service (no JWT, Docker network only)
  - `PATCH /internal/documents/:id/status` → update lifecycle status
  - `POST /internal/documents/:id/provenance` → write provenance record
  - `POST /internal/audit` → write audit log entry

---

## Data model (Prisma)

**Existing:** User, Chat, Message, ChatDocument

**Phase B additions:**
- `Document(id, userId, originalFilename, mimeType, fileSizeBytes, status, chunkCount, openSearchIndex, kbId, ...)`
- `DocumentProvenance(id, documentId, rawFileSha256, chunkingStrategy, embeddingModel, stagesMs, ...)`
- `AuditLog(id, userId, action, resource, outcome, metadata, createdAt)`
- `KnowledgeBase(id, name, ownerId, openSearchIndex, embeddingModel, embedDim, ...)`
- `KBMember(id, kbId, userId, role: OWNER|EDITOR|VIEWER)`

Migrations: `mcp-server/prisma/migrations/`

---

## Operations & Troubleshooting

- Create the external docker network if missing: `docker network create shared_rass_network`
- OpenSearch health: `curl http://localhost:9200/_cluster/health`
- Redis docstore stats: `GET http://localhost:8001/docstore/stats`
- Bull Board (ingestion queue): `http://localhost:8001/admin/queues` (non-production)
- Document upload stuck in QUEUED? Check that the embedding-service worker is running.
- Index dimension mismatch: If you change embedding model/dimension, recreate the index.

---

## Evaluation

`evaluation/` contains a TruLens-based evaluator (Python). See `evaluation/requirements.txt`.

---

## Contributing

- Keep config keys aligned across services.
- Prefer small, focused PRs. Update docs when changing public behavior.
- Add/adjust tests when modifying retrieval or ingestion logic.

## License

MIT

---

## Service Module Structure

### embedding-service/src/
```
src/
  config.js                      ← validated config loading (exits on bad/missing fields)
  clients/
    redisClient.js                ← Redis client + docstore state
    opensearchClient.js           ← OpenSearch client + ensureIndexExists()
    embedder.js                   ← embedding provider factory + EMBEDDING_MODEL_NAME
  store/
    redisDocumentStore.js         ← RedisDocumentStore (LangChain BaseStore)
  ingestion/
    parser.js                     ← file-type detection + document loaders
    chunker.js                    ← legacy pre-configured splitters
  chunking/                       ← Phase B: configurable chunking strategies
    ChunkingStrategy.js           ← abstract base class
    FixedSizeChunker.js
    RecursiveCharacterChunker.js
    SentenceWindowChunker.js
    index.js                      ← createChunker(strategy, options) factory
  queue/
    ingestionQueue.js             ← Phase B: BullMQ "rass:ingestion" queue
  workers/
    ingestionWorker.js            ← Phase B: async processor (parse→chunk→embed→index→provenance)
  routes/
    upload.js                     ← POST /upload → enqueues job, returns 202 + jobId
    ingestStatus.js               ← GET /ingest/status/:jobId
    documents.js                  ← POST /get-documents, GET /docstore/stats
    admin.js, health.js
  schemas/
    configSchema.js, uploadSchema.js, index.js
  middleware/validate.js
  __tests__/
    config.test.js, uploadSchema.test.js
    chunking.test.js              ← Phase B: 16 chunking strategy unit tests
```

### mcp-server/src/
```
src/
  config.js, authRoutes.js, authMiddleware.js, chatRoutes.js
  services/
    auditService.js               ← Phase B: writes to AuditLog table
  proxy/
    embedUpload.js                ← creates Document registry entry + forwards to embedding-service
    ingestStatus.js               ← GET /api/ingest/status/:jobId proxy
    streamAsk.js, chatCompletions.js, userDocuments.js, transcribe.js
  routes/
    documents.js                  ← Phase B: GET/POST/DELETE /api/documents + provenance
    knowledgeBases.js             ← Phase B: GET/POST/DELETE /api/knowledge-bases
    internalService.js            ← Phase B: /internal/* routes (service-to-service)
  gateway/mcpTools.js, mcpTransport.js
  schemas/, middleware/, __tests__/
```

Run unit tests:
```bash
cd embedding-service && npm test    # includes 16 chunking tests
cd rass-engine-service && npm test
cd mcp-server && npm test
```

Swagger UI: `http://localhost:8080/api/docs` (non-production)
