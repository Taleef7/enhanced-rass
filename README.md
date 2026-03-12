# RASS (Retrieval-Augmented Semantic Search)

A production-grade, multi-service Retrieval Augmented Generation (RAG/RASS) system with document ingestion, hybrid retrieval, SSE streaming, and a polished React frontend. It's built for clarity and reproducibility: one configuration file, containerized services, and sensible defaults.

## What you get

- Multi-provider embeddings (OpenAI or Gemini) with correct vector dimensioning
- **Async document ingestion** via BullMQ job queue (no more HTTP timeouts on large files)
- **Document registry** with lifecycle tracking (QUEUED → PROCESSING → READY → FAILED)
- **ETL provenance** records for every ingested document (SHA-256, stage timings, chunking config, embedding model)
- **Configurable chunking strategies**: `fixed_size`, `recursive_character`, `sentence_window` — selectable via `config.yml`
- **Bring-Your-Own Knowledge Base (BYO KB)**: per-user/team knowledge bases with dedicated OpenSearch indices
- **Multi-tenant workspaces** with per-workspace OpenSearch indices and strict data isolation
- **RBAC** — Viewer / Editor / Admin roles with permission-checked routes and automatic audit denial logging
- **Enterprise audit logging** — tamper-evident append-only `AuditLog` with IP, user-agent, resourceType; CSV export for compliance
- **API key authentication** — machine-to-machine auth; raw key shown once, only hash stored
- **Refresh token rotation** — short-lived JWTs (15 min) + rotating HTTP-only refresh token cookie (7-day)
- **Data retention & right-to-erasure** — per-workspace `retentionDays` policy, nightly purge sweep, `DELETE /api/users/:id/data`
- Hybrid retrieval over OpenSearch (KNN + keyword) scoped per-user / per-KB / per-workspace
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
- All searches are strictly filtered by metadata.userId (or KB / workspace membership).
- Parent chunks live in Redis keyed by UUID; child chunks are in OpenSearch with metadata including userId, originalFilename, uploadedAt, parentId, documentId, kbId, workspaceId.
- Chats/messages and the document registry are in Postgres. JWT is stored **in memory only** (not localStorage); an HTTP-only refresh-token cookie maintains sessions silently.

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

## Phase D Features — Enterprise Readiness

### #119 — Multi-tenant Workspaces with Strict Data Isolation
- `POST /api/organizations` — create an organization (creator becomes OWNER).
- `GET  /api/organizations` — list orgs the current user belongs to.
- `POST /api/organizations/:orgId/workspaces` — create a workspace; **automatically provisions a dedicated OpenSearch index** (`ws_<timestamp>_<random>`).
- `GET  /api/workspaces/:id/usage` — real-time quota usage (usedMb / quotaMb).
- `DELETE /api/workspaces/:id` — deletes the OpenSearch index and soft-deletes all workspace documents.
- Workspace member management: `POST/DELETE/PATCH /api/workspaces/:id/members`.
- Documents uploaded to a workspace target only its OpenSearch index; cross-workspace data access is impossible at the query level.
- Quota enforcement: `usedMb` tracked on the `Workspace` model; exceeding quota blocks further uploads.
- Per-workspace `retentionDays` policy for automatic document expiry.

### #120 — Role-Based Access Control (RBAC) with Fine-Grained Permissions
- `mcp-server/src/permissions.js` — defines `PERMISSIONS` constants and `ROLE_PERMISSIONS` map for VIEWER / EDITOR / ADMIN roles.
- `mcp-server/src/middleware/requirePermission.js` — Express middleware that resolves workspace membership from request context and checks if the caller's role includes the required permission.
- **Permission matrix:**

| Role | document:read | document:create | document:delete | workspace:read | workspace:manage |
|---|---|---|---|---|---|
| VIEWER  | ✓ | — | — | ✓ | — |
| EDITOR  | ✓ | ✓ | — | ✓ | — |
| ADMIN   | ✓ | ✓ | ✓ | ✓ | ✓ |

- `DELETE /api/documents/:id` is now gated behind `requirePermission(PERMISSIONS.DOCUMENT_DELETE)`.
- Every permission denial is written to the `AuditLog` with `action: PERMISSION_DENIED`, role, and required permission.
- Role changes take effect immediately (no JWT re-issue required; roles are looked up live per-request).

### #121 — Data Retention Policies and Secure Document Purge
- `mcp-server/src/services/PurgeService.js` — `purgeDocument()` removes all traces: OpenSearch child chunks, Redis parent keys (via embedding-service internal API), Postgres metadata (`purgedAt`, `purgedBy` fields).
- `runRetentionSweep()` — queries all workspaces with `retentionDays` set, purges documents older than the policy cutoff. Scheduled automatically every 24 h on server startup via `setInterval`.
- `POST /api/admin/retention-sweep` — manually trigger the sweep (org admin only; responds 202, runs async).
- `purgeUserData()` — purges all documents and chats for a user (GDPR right-to-erasure).
- `DELETE /api/users/:id/data` — admin-only endpoint; returns a `purgeSummary` listing all deleted resources.
- All purge operations are recorded in the `AuditLog` with `requestedBy` and `completedAt`.

### #122 — API Key Authentication and Refresh Token Flow
**API Key Authentication:**
- `GET  /api/api-keys` — list keys (no raw key shown).
- `POST /api/api-keys` — create a key; raw value shown **exactly once**, only `bcrypt` hash stored.
- `DELETE /api/api-keys/:id` — revoke a key.
- `authMiddleware` accepts `Authorization: ApiKey <raw_key>` in addition to `Bearer <jwt>`.
- Expired keys are automatically excluded; `lastUsed` timestamp is updated on each use.

**Refresh Token Flow:**
- JWT lifetime reduced to `15m` (configurable via `JWT_EXPIRES_IN` env var).
- On login: a 7-day `RefreshToken` is created (hashed with SHA-256) and set as an **HTTP-only `refreshToken` cookie** on `/api/auth/refresh`.
- `POST /api/auth/refresh` — validates the cookie, marks the token as used (rotation), and issues a fresh JWT + new refresh token.
- `POST /api/auth/logout` — invalidates the refresh token cookie and writes an audit log entry.

**Frontend security improvement:**
- JWT moved from `localStorage` to **in-memory React state** (AuthContext).
- Silent refresh is scheduled 1 minute before JWT expiry using the HTTP-only cookie.
- On page reload, the app silently calls `/api/auth/refresh` to restore the session without storing sensitive data in `localStorage`.

### #123 — Enterprise-Grade Audit Logging and Compliance Reporting
**Enhanced AuditLog schema:**
- New fields: `workspaceId`, `resourceType`, `resourceId`, `ipAddress` (extracted from `X-Forwarded-For` or socket), `userAgent`, `outcome` (enum: `SUCCESS | FAILURE | PARTIAL`).
- Composite indices on `(userId, timestamp)` and `(workspaceId, timestamp)` for fast filtering.
- Records are **append-only** — no `UPDATE` or `DELETE` on this table via the service layer.

**Instrumented events:**
- Auth: `REGISTER`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `TOKEN_REFRESH_SUCCESS`, `TOKEN_REFRESH_FAILED`, `LOGOUT`
- Documents: `DOCUMENT_UPLOADED`, `DOCUMENT_DELETED`, `DOCUMENT_PURGED`
- Knowledge Bases: `KB_CREATED`, `KB_DELETED`
- Workspaces: `WORKSPACE_CREATED`, `WORKSPACE_DELETED`, `WORKSPACE_SETTINGS_UPDATED`
- Members: `ORG_MEMBER_ADDED`, `WORKSPACE_MEMBER_ADDED`, `WORKSPACE_MEMBER_REMOVED`, `WORKSPACE_MEMBER_ROLE_CHANGED`
- Security: `PERMISSION_DENIED`, `API_KEY_CREATED`, `API_KEY_REVOKED`
- Compliance: `USER_DATA_PURGED`, `RETENTION_SWEEP_TRIGGERED`

**Compliance reporting endpoints (org admin only):**
- `GET /api/admin/audit-logs` — paginated, filterable (userId, action, workspaceId, outcome, dateFrom, dateTo).
- `GET /api/admin/audit-logs/export` — CSV export (up to 50,000 rows) with all fields; correct MIME type and `Content-Disposition` header for download.
- `GET /api/admin/users` — paginated user list with document/chat/API key counts.

---

## Configuration

- `config.yml` (root, mounted into services):
  - `OPENSEARCH_*` host/port/index, `REDIS_*` host/db, provider names, chunk sizes, `EMBED_DIM`.
  - **Phase B**: `CHUNKING_STRATEGY` — choose `fixed_size`, `recursive_character`, or `sentence_window`.
  - **Phase C**: `RERANK_PROVIDER`, `RERANK_TOP_N`, `COHERE_RERANK_MODEL`, `HYDE_ENABLED`, `HYDE_MAX_TOKENS`.
- `.env` (root): `OPENAI_API_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`.
- **Phase D env vars:**
  - `JWT_EXPIRES_IN` — JWT lifetime (default `15m`).
  - `CORS_ORIGIN` — allowed CORS origin for the `credentials: true` cookie flow (default: all origins in dev).
  - `NODE_ENV=production` — enforces secure cookie flag on refresh tokens, rejects missing `JWT_SECRET`.
- **`INTERNAL_SERVICE_TOKEN`** (env var, **required in production**): shared secret used to authenticate the embedding-service worker's calls to mcp-server `/internal/*` routes. Set a strong random value. If unset, the server logs a prominent warning on every internal request but still allows traffic (for local development convenience only).

Provider pairing tips:
- Gemini text-embedding-004 → `EMBED_DIM: 768`
- OpenAI text-embedding-3-large → `EMBED_DIM: 3072`

---

## API map (selected)

- Frontend → mcp-server (all require Bearer or ApiKey unless noted)
  - `POST /api/auth/register`, `/api/auth/login`
  - `POST /api/auth/refresh` — rotate refresh token cookie, get new JWT (no auth header required)
  - `POST /api/auth/logout` — invalidate refresh token
  - `GET /api/chats`, `POST /api/chats`, `PATCH/DELETE /api/chats/:id`
  - `POST /api/embed-upload` → returns 202 with `{ documentId, jobs: [{ jobId }] }`
  - `GET /api/ingest/status/:jobId` → `{ status, progress, result }` (poll every 2 s)
  - `POST /api/stream-ask` → SSE stream with citations
  - `GET /api/documents` → paginated document registry list
  - `DELETE /api/documents/:id` → soft-delete (RBAC: requires `document:delete` permission in workspace context)
  - `GET /api/documents/:id/provenance` → ETL provenance record
  - `GET /api/knowledge-bases` → list accessible KBs
  - `POST /api/knowledge-bases` → create KB
  - `DELETE /api/knowledge-bases/:id` → delete KB
  - `GET  /api/organizations` → list orgs for current user
  - `POST /api/organizations` → create org
  - `POST /api/organizations/:orgId/workspaces` → create workspace (provisions OpenSearch index)
  - `GET  /api/workspaces/:id/usage` → quota usage
  - `DELETE /api/workspaces/:id` → delete workspace + index + docs
  - `POST/DELETE/PATCH /api/workspaces/:id/members` → member management
  - `GET  /api/api-keys` → list API keys
  - `POST /api/api-keys` → create API key (raw shown once)
  - `DELETE /api/api-keys/:id` → revoke API key
  - `GET /api/admin/audit-logs` → paginated, filterable audit log (org admin only)
  - `GET /api/admin/audit-logs/export` → CSV export (org admin only)
  - `DELETE /api/users/:id/data` → GDPR right-to-erasure (org admin only)
  - `POST /api/admin/retention-sweep` → manually trigger retention sweep (org admin only)
  - `GET /api/admin/users` → paginated user list (org admin only)
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
- `Document(id, userId, originalFilename, mimeType, fileSizeBytes, status, chunkCount, openSearchIndex, kbId, workspaceId, purgedAt, purgedBy, ...)`
- `DocumentProvenance(id, documentId, rawFileSha256, chunkingStrategy, embeddingModel, stagesMs, ...)`
- `AuditLog(id, timestamp, userId, workspaceId, action, resourceType, resourceId, ipAddress, userAgent, outcome: AuditOutcome, metadata)`
- `KnowledgeBase(id, name, ownerId, openSearchIndex, embeddingModel, embedDim, ...)`
- `KBMember(id, kbId, userId, role: OWNER|EDITOR|VIEWER)`

**Phase D additions:**
- `Organization(id, name, plan: OrgPlan, createdAt)`
- `OrgMember(id, orgId, userId, role: OrgRole)` — `OWNER | ADMIN | MEMBER`
- `Workspace(id, orgId, name, openSearchIndex, quotaMb, usedMb, retentionDays, createdAt)`
- `WorkspaceMember(id, workspaceId, userId, role: WsRole)` — `ADMIN | EDITOR | VIEWER`
- `ApiKey(id, keyHash, name, userId, lastUsed, expiresAt, createdAt)`
- `RefreshToken(id, tokenHash, userId, expiresAt, usedAt, createdAt)`

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
  permissions.js                ← Phase D: PERMISSIONS constants + ROLE_PERMISSIONS map
  services/
    auditService.js             ← Phase B+D: writes to AuditLog (IP/UA/workspaceId/resourceType)
    PurgeService.js             ← Phase D: purgeDocument, purgeUserData, runRetentionSweep
  middleware/
    requirePermission.js        ← Phase D: RBAC permission-check middleware
    rateLimits.js, validate.js
  proxy/
    embedUpload.js              ← creates Document registry entry + forwards to embedding-service
    ingestStatus.js             ← GET /api/ingest/status/:jobId proxy
    streamAsk.js, chatCompletions.js, userDocuments.js, transcribe.js
  routes/
    documents.js                ← Phase B+D: GET/POST/DELETE /api/documents + provenance; RBAC on delete
    knowledgeBases.js           ← Phase B: GET/POST/DELETE /api/knowledge-bases
    internalService.js          ← Phase B: /internal/* routes (service-to-service)
    workspaces.js               ← Phase D: org + workspace CRUD, member mgmt, quota, OS index provisioning
    apiKeys.js                  ← Phase D: API key create/list/revoke
    admin.js                    ← Phase D: audit log viewer, CSV export, right-to-erasure, retention sweep
  gateway/mcpTools.js, mcpTransport.js
  schemas/, __tests__/
```

Run unit tests:
```bash
cd embedding-service && npm test    # includes 16 chunking tests
cd rass-engine-service && npm test
cd mcp-server && npm test
```

Swagger UI: `http://localhost:8080/api/docs` (non-production)
