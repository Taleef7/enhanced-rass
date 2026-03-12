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

## Phase C Features — Retrieval Excellence

### #114 — Modular, Pluggable Multi-Stage Retrieval Pipeline
The retrieval logic is now expressed as an **ordered pipeline of independent, testable stages**:

| Stage | File | Description |
|---|---|---|
| `HydeQueryExpansionStage` | `src/retrieval/HydeQueryExpansionStage.js` | Optionally expand query with hypothetical document (HyDE) |
| `EmbedQueryStage` | `src/retrieval/EmbedQueryStage.js` | Embed the (expanded) query string |
| `HybridSearchStage` | `src/retrieval/HybridSearchStage.js` | KNN + BM25 hybrid search against OpenSearch |
| `ParentFetchStage` | `src/retrieval/ParentFetchStage.js` | Fetch full parent documents from the embedding service |
| `DeduplicateStage` | `src/retrieval/DeduplicateStage.js` | Remove duplicate parent documents by content |
| `RerankStage` | `src/retrieval/RerankStage.js` | Apply cross-encoder reranking (no-op if disabled) |
| `TopKSelectStage` | `src/retrieval/TopKSelectStage.js` | Select top-K documents for generation |

- Each stage can be **individually unit-tested** by providing a mock context object.
- Stage wall-clock times are **logged as structured JSON** at INFO level with `stage`, `durationMs`, `pipeline` fields.
- A stage can be disabled/replaced via `config.yml` without modifying any stage implementation.
- The pipeline is assembled in `src/retrieval/createPipeline.js` and created once at startup.

### #115 — Cross-Encoder Reranking
Three reranking providers with a clean provider abstraction:

| Provider | Config value | Description |
|---|---|---|
| `NoopRerankProvider` | `RERANK_PROVIDER: none` | Default; returns documents unchanged |
| `CohereRerankProvider` | `RERANK_PROVIDER: cohere` | Uses Cohere Rerank API (`COHERE_API_KEY` required) |
| `LocalCrossEncoderProvider` | `RERANK_PROVIDER: local` | Calls a local Python cross-encoder microservice on `RERANKER_PORT` |

```yaml
# config.yml
RERANK_PROVIDER: "none"     # none | cohere | local
RERANK_TOP_N: 5
COHERE_RERANK_MODEL: "rerank-english-v3.0"
```
Rerank scores are logged at DEBUG level and propagated to citations as `relevanceScore`.

### #116 — HyDE (Hypothetical Document Embeddings) Query Expansion
- `HydeQueryExpansionStage` generates a hypothetical answer document before embedding.
- The original query is always preserved in `context.originalQuery` for display and citation.
- **Falls back gracefully** to the original query if LLM generation fails (no crash).
- Stage timing surfaced in structured log output.

```yaml
# config.yml
HYDE_ENABLED: false        # opt-in
HYDE_MAX_TOKENS: 200
```

### #117 — Structured Citations with Source Attribution and Confidence
Every answer stream now emits a **structured `citations` SSE event** after the token stream:

```json
{
  "choices": [{
    "delta": {
      "custom_meta": {
        "type": "citations",
        "citations": [{
          "index": 1,
          "documentId": "...",
          "documentName": "report.pdf",
          "chunkId": "...",
          "relevanceScore": 0.87,
          "excerpt": "First 200 chars of the source chunk...",
          "pageNumber": 3,
          "uploadedAt": "2026-01-01T00:00:00.000Z",
          "grounded": true
        }]
      }
    }
  }]
}
```

- `relevanceScore` reflects the reranker score (if reranking is enabled) or the raw hybrid search score.
- `grounded: true/false` — post-hoc verification that the cited excerpt is semantically present in the answer.
- Frontend renders **expandable citation cards** with document name, score badge, page number, excerpt, and a grounding indicator (✓ or ⚠).

### #118 — Automated RAG Evaluation Harness
A complete evaluation harness with CI integration:

| Component | Path | Description |
|---|---|---|
| Test set | `evaluation/datasets/test_set.json` | 22 labeled queries across 6 categories |
| Runner | `evaluation/run_eval.py` | CLI runner; produces `run_<timestamp>.json` |
| Comparison | `evaluation/compare_runs.py` | Regression detector; exits 1 if any metric degrades > threshold |
| CI workflow | `.github/workflows/weekly-eval.yml` | Runs every Monday; publishes GitHub Actions summary |
| Baselines | `evaluation/results/run_*.json` | Two reference runs checked in |

**Metrics per query:** `context_relevance`, `answer_faithfulness`, `answer_relevance`, `recall_at_5`, `latency_ms`  
**Aggregates:** mean, p50, p95 for each metric.

```bash
# Run evaluation
python evaluation/run_eval.py --url http://localhost:8000 --top-k 5

# Compare against previous baseline (exits 1 on regression > 5%)
python evaluation/compare_runs.py --threshold 0.05
```

---

## Configuration

- `config.yml` (root, mounted into services):
  - `OPENSEARCH_*` host/port/index, `REDIS_*` host/db, provider names, chunk sizes, `EMBED_DIM`.
  - **Phase B**: `CHUNKING_STRATEGY` — choose `fixed_size`, `recursive_character`, or `sentence_window`.
  - **Phase C**: `RERANK_PROVIDER`, `RERANK_TOP_N`, `COHERE_RERANK_MODEL`, `HYDE_ENABLED`, `HYDE_MAX_TOKENS`.
- `.env` (root): `OPENAI_API_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`.
- **`INTERNAL_SERVICE_TOKEN`** (env var, **required in production**): shared secret used to authenticate the embedding-service worker's calls to mcp-server `/internal/*` routes. Set a strong random value. If unset, the server logs a prominent warning on every internal request but still allows traffic (for local development convenience only).

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
  - `DELETE /api/documents/:id` → soft-delete document (best-effort vector removal; Redis parent chunks are not immediately removed)
  - `GET /api/documents/:id/provenance` → ETL provenance record
  - `GET /api/knowledge-bases` → list accessible KBs
  - `POST /api/knowledge-bases` → create KB
  - `DELETE /api/knowledge-bases/:id` → delete KB
- embedding-service (no built-in auth — **must be reachable only from mcp-server/internal network**)
  - `POST /upload` → enqueues async ingestion job, returns `{ jobs: [{ jobId, documentId }] }`
    - **Security**: `userId` is derived from the authenticated mcp-server request, not client-supplied. Never expose port 8001 publicly. The mcp-server validates KB membership before forwarding.
  - `GET /ingest/status/:jobId` → BullMQ job status
  - `GET /admin/queues` → Bull Board UI (**dev only — never expose publicly**)
  - `POST /get-documents`, `GET /docstore/stats` → internal/diagnostic endpoints (**dev only; must be auth/IP restricted or disabled in production**; exposing these publicly would allow unauthenticated access to all ingested document content)
- Internal service-to-service (authenticated via `X-Internal-Token` shared secret; no end-user JWT)
  - `PATCH /internal/documents/:id/status` → update lifecycle status (requires `INTERNAL_SERVICE_TOKEN`)
  - `POST /internal/documents/:id/provenance` → write provenance record (requires `INTERNAL_SERVICE_TOKEN`)
  - `POST /internal/audit` → write audit log entry (requires `INTERNAL_SERVICE_TOKEN`)

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

`evaluation/` contains a complete evaluation harness:

- `evaluation/datasets/test_set.json` — 22 labeled queries (Phase C #118)
- `evaluation/run_eval.py` — CLI runner; measures context_relevance, answer_faithfulness, answer_relevance, recall@5, and latency
- `evaluation/compare_runs.py` — regression detector (exits 1 if any metric degrades > configurable threshold)
- `evaluation/results/` — baseline runs and impact analysis for reranking and HyDE
- `.github/workflows/weekly-eval.yml` — scheduled CI workflow (Mondays at 06:00 UTC)

Legacy TruLens script: `evaluation/trulens_evaluator/evaluate.py`. See `evaluation/trulens_evaluator/requirements.txt`.

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
    documents.js                  ← POST /get-documents, GET /docstore/stats (internal/diagnostic — dev only; IP-restrict or disable in production)
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
