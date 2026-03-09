# Phase A — Modernization Issues

This document contains the full specification for all **Phase A** GitHub issues. These issues are automatically created by the [`.github/workflows/create-phase-a-issues.yml`](../.github/workflows/create-phase-a-issues.yml) workflow. Run the workflow manually from the **Actions** tab to open all issues in GitHub.

---

## Phase 1 — Modularization & Layered Architecture

The goal of Phase 1 is to eliminate architecture entropy: each service's `index.js` is currently a monolith. These issues decompose each service into well-named, single-responsibility modules.

---

### Issue 1.1 — Refactor `embedding-service/index.js` into layered modules

**Title:** `[Phase A][1.1] Refactor embedding-service/index.js into layered modules`
**Labels:** `refactor`, `phase-a`, `good first issue`

#### Summary

The `embedding-service/index.js` is a 534-line monolith handling config loading, a custom `RedisDocumentStore` class, Redis client setup, OpenSearch index management, embedding provider initialization, document ingestion (PDF/DOCX/TXT parsing, parent/child chunking, batch embedding), and all HTTP REST endpoints in a single file.

#### Current Structure

```
embedding-service/
  index.js          ← 534 lines, all concerns mixed
  prisma/
  package.json
  Dockerfile
```

#### Target Structure

```
embedding-service/
  index.js                           ← thin orchestrator (~30 lines)
  src/
    config.js                        ← config loading and export
    clients/
      redisClient.js                 ← Redis client + connection handlers + initializeDocstore()
      embedder.js                    ← embedding provider factory (OpenAI / Gemini)
      opensearchClient.js            ← OpenSearch client + ensureIndexExists()
    store/
      redisDocumentStore.js          ← RedisDocumentStore class (LangChain BaseStore impl)
    ingestion/
      parser.js                      ← file-type detection + text extraction (PDF/DOCX/TXT)
      chunker.js                     ← parent/child document splitting logic
    routes/
      upload.js                      ← POST /upload
      documents.js                   ← POST /get-documents, GET /docstore/stats
      admin.js                       ← POST /clear-docstore
      health.js                      ← GET /health
```

#### Acceptance Criteria

- [ ] `embedding-service/src/` directory created with the module structure above
- [ ] `RedisDocumentStore` class extracted to `src/store/redisDocumentStore.js`; public API unchanged
- [ ] Redis client setup extracted to `src/clients/redisClient.js`
- [ ] OpenSearch client and `ensureIndexExists()` extracted to `src/clients/opensearchClient.js`
- [ ] Embedding provider factory extracted to `src/clients/embedder.js`
- [ ] Document parsing and chunking extracted to `src/ingestion/`
- [ ] Each route handler extracted to its corresponding file under `src/routes/`
- [ ] `index.js` reduced to imports, route registration, and `app.listen()`
- [ ] All existing HTTP endpoints maintain their current behavior (no contract changes)
- [ ] No circular dependencies between modules
- [ ] Service starts and passes `GET /health` after refactor

#### Related Issues
`#1.2`, `#1.3`, `#1.5`, `#2.1`

---

### Issue 1.2 — Refactor `rass-engine-service` into planner, retrieval, and generation modules

**Title:** `[Phase A][1.2] Refactor rass-engine-service into planner, retrieval, and generation modules`
**Labels:** `refactor`, `phase-a`

#### Summary

The `rass-engine-service` has its core RAG logic spread across `index.js` (433 lines) plus standalone `hydeGenerator.js` and `executePlan.js` modules. The central `ask()` function alone is 175 lines and mixes search planning, two-stage retrieval, LLM context assembly, answer generation, and SSE streaming into a single flow.

#### Current Structure

```
rass-engine-service/
  index.js            ← 433 lines: LLM init, embedder, planner, retrieval, generation, streaming, routes
  hydeGenerator.js    ← HyDE hypothetical document generation
  executePlan.js      ← multi-step plan execution against OpenSearch
  package.json
  Dockerfile
```

#### Target Structure

```
rass-engine-service/
  index.js                           ← thin orchestrator (~30 lines)
  src/
    config.js                        ← config loading and export
    clients/
      llmClient.js                   ← LLM client factory (OpenAI / Gemini)
      embedder.js                    ← search-term embedding client
      opensearchClient.js            ← OpenSearch client setup
    planner/
      searchPlanner.js               ← createRefinedSearchPlan() — LLM-based query expansion
      hydeGenerator.js               ← moved from root hydeGenerator.js
    retrieval/
      simpleSearch.js                ← KNN + keyword hybrid search against OpenSearch
      executePlan.js                 ← moved from root executePlan.js
    generation/
      generator.js                   ← LLM context assembly + answer generation (non-streaming)
      streaming.js                   ← writeSSE(), streaming generation pipeline
    routes/
      ask.js                         ← POST /ask
      streamAsk.js                   ← POST /stream-ask
    schemas/                         ← populated by Issues 2.2 and 2.3
```

#### Acceptance Criteria

- [ ] `rass-engine-service/src/` directory created with the module structure above
- [ ] `hydeGenerator.js` and `executePlan.js` moved into `src/planner/` and `src/retrieval/` respectively
- [ ] `createRefinedSearchPlan()` extracted to `src/planner/searchPlanner.js`
- [ ] `embedText()` extracted to `src/clients/embedder.js`
- [ ] LLM client initialization extracted to `src/clients/llmClient.js`
- [ ] `writeSSE()` and streaming orchestration extracted to `src/generation/streaming.js`
- [ ] Non-streaming generation logic extracted to `src/generation/generator.js`
- [ ] Route handlers extracted to `src/routes/`
- [ ] `index.js` reduced to imports, route registration, and `app.listen()`
- [ ] POST `/ask` and POST `/stream-ask` maintain existing request/response contracts
- [ ] Service starts and responds correctly to a test query after refactor

#### Related Issues
`#1.1`, `#1.3`, `#1.5`, `#2.2`, `#2.3`

---

### Issue 1.3 — Refactor `mcp-server` into gateway, auth, chat, and proxy modules

**Title:** `[Phase A][1.3] Refactor mcp-server into gateway, auth, chat, and proxy modules`
**Labels:** `refactor`, `phase-a`

#### Summary

`mcp-server/index.js` is a 464-line file combining OpenAI-compatible chat proxy, file upload proxy, audio transcription, streaming query proxy, OpenSearch user-document aggregation, a legacy simple-ask endpoint, MCP tool definitions, and MCP transport handling. Auth and chat routes are already extracted (`src/authRoutes.js`, `src/chatRoutes.js`, `src/authMiddleware.js`).

#### Current Structure

```
mcp-server/
  index.js              ← 464 lines (proxy + MCP tools + transport + misc)
  src/
    authRoutes.js        ← ✅ already extracted
    authMiddleware.js    ← ✅ already extracted
    chatRoutes.js        ← ✅ already extracted
  prisma/
  package.json
  Dockerfile
```

#### Target Structure

```
mcp-server/
  index.js                           ← thin orchestrator (~40 lines)
  src/
    config.js                        ← config loading and export
    authRoutes.js                    ← (unchanged)
    authMiddleware.js                ← (unchanged)
    chatRoutes.js                    ← (unchanged)
    proxy/
      embedUpload.js                 ← POST /api/embed-upload (file upload → embedding-service)
      streamAsk.js                   ← POST /api/stream-ask (SSE proxy → rass-engine-service)
      chatCompletions.js             ← POST /api/chat/completions (OpenAI-compat proxy)
      userDocuments.js               ← GET /api/user-documents (OpenSearch aggregation)
      transcribe.js                  ← POST /api/transcribe (Whisper)
    gateway/
      mcpTools.js                    ← MCP tool definitions (queryRASS, addDocumentToRASS)
      mcpTransport.js                ← POST /mcp endpoint + StreamableHTTPServerTransport
```

#### Acceptance Criteria

- [ ] `mcp-server/src/proxy/` and `mcp-server/src/gateway/` directories created
- [ ] Each proxy handler extracted to its own file
- [ ] MCP tool definitions extracted to `src/gateway/mcpTools.js`
- [ ] MCP transport handler extracted to `src/gateway/mcpTransport.js`
- [ ] Existing `src/authRoutes.js`, `src/authMiddleware.js`, `src/chatRoutes.js` left unchanged
- [ ] Legacy `POST /simple-ask` preserved or tagged `@deprecated` with a comment
- [ ] `index.js` reduced to app setup, middleware registration, route mounting, and `app.listen()`
- [ ] All existing API endpoints maintain their current request/response contracts
- [ ] Frontend continues to function correctly after refactor

#### Related Issues
`#1.1`, `#1.2`, `#1.5`, `#2.1`, `#2.4`

---

### Issue 1.5 — Add centralized config loading and validation utility per service

**Title:** `[Phase A][1.5] Add centralized config loading and validation utility per service`
**Labels:** `refactor`, `phase-a`, `dx`

#### Summary

All three services load `config.yml` identically via raw `js-yaml` with no validation:

```js
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const { OPENSEARCH_HOST, EMBED_DIM, ... } = config;
```

A missing or mistyped key silently produces `undefined`, which propagates into service logic and produces cryptic runtime errors. This issue creates a `src/config.js` module in each service that owns all config loading and exposes validated, named exports.

#### Acceptance Criteria

- [ ] Create `embedding-service/src/config.js` with config loading, validation (see #2.5), and named exports
- [ ] Create `rass-engine-service/src/config.js` with same pattern
- [ ] Create `mcp-server/src/config.js` with same pattern
- [ ] Each service's `index.js` imports from `./src/config.js` instead of loading YAML directly
- [ ] Throws a descriptive error with invalid field names if validation fails, causing `process.exit(1)` before binding a port
- [ ] Config loading unit-tested: valid config parses; missing required field throws descriptive error
- [ ] `config.yml` annotated with inline comments describing each field's type and allowed values

#### Related Issues
`#1.1`, `#1.2`, `#1.3`, `#2.5`

---

## Phase 2 — Schema Contracts & Validation

The goal of Phase 2 is to formalize contracts: replace ad-hoc if-checks with Zod schemas, define canonical types for internal data structures, and generate an OpenAPI spec for the public API.

---

### Issue 2.1 — Introduce Zod schema validation for all external API payloads

**Title:** `[Phase A][2.1] Introduce Zod schema validation for all external API payloads`
**Labels:** `enhancement`, `phase-a`, `validation`

#### Summary

All three services validate external HTTP inputs with ad-hoc conditional checks. There is no centralized validation, no schema documentation, and error messages are inconsistent. `mcp-server` already depends on `zod` (used only for MCP tool definitions).

#### Acceptance Criteria

**Middleware**
- [ ] Create reusable `validateBody(schema)` Express middleware that:
  - Calls `schema.safeParse(req.body)`
  - On failure: returns `{ error: 'Validation failed', details: zodError.issues }` with HTTP 400
  - On success: attaches `req.validatedBody` and calls `next()`
- [ ] Create matching `validateQuery(schema)` for query-string validation

**Schemas**
- [ ] **embedding-service** `src/schemas/uploadSchema.js`: `UploadBodySchema` — `userId` non-empty string
- [ ] **rass-engine-service** `src/schemas/askSchema.js`:
  - `AskBodySchema`: `query` non-empty string; `top_k` optional positive int; `userId` optional string
  - `StreamAskBodySchema`: same but `userId` **required**
- [ ] **mcp-server** `src/schemas/`: schemas for embed-upload, stream-ask, chat-completions, transcribe, user-documents query

**Dependencies**
- [ ] Add `zod` to `embedding-service` and `rass-engine-service` `package.json`

**Testing**
- [ ] At least one test per schema: valid input passes; missing required field returns 400; wrong type returns 400

#### Related Issues
`#1.1`, `#1.2`, `#1.3`, `#2.2`, `#2.5`

---

### Issue 2.2 — Define shared Zod schemas for planner output and retrieval steps

**Title:** `[Phase A][2.2] Define shared Zod schemas for planner output and retrieval steps`
**Labels:** `enhancement`, `phase-a`, `validation`

#### Summary

`rass-engine-service` generates a structured search plan from LLM output and parses it with a bare `JSON.parse()` — no schema validation. If the LLM returns malformed JSON or an unexpected structure, the error surfaces deep in the retrieval pipeline rather than at the boundary.

#### Schemas to Create (`src/schemas/plannerSchemas.js`)

```js
SearchTermSchema      // z.string().min(1).max(500)
SearchPlanSchema      // z.array(SearchTermSchema).min(1).max(10)
PlanStepSchema        // { query: string, method: enum['knn','bm25','hybrid'], top_k?: int }
ExecutionPlanSchema   // z.array(PlanStepSchema).min(1)
```

#### Acceptance Criteria

- [ ] `rass-engine-service/src/schemas/plannerSchemas.js` created with all four schemas
- [ ] `createRefinedSearchPlan()` validates LLM output against `SearchPlanSchema`; falls back gracefully on failure
- [ ] `executePlan.js` validates input against `ExecutionPlanSchema` at entry
- [ ] All schemas exported from `src/schemas/index.js`
- [ ] Unit tests covering: valid/invalid arrays, wrong enum method, boundary conditions

#### Related Issues
`#1.2`, `#2.1`, `#2.3`

---

### Issue 2.3 — Define canonical schemas for retrieval hits and citations

**Title:** `[Phase A][2.3] Define canonical schemas for retrieval hits and citations`
**Labels:** `enhancement`, `phase-a`, `validation`

#### Summary

OpenSearch retrieval results and LLM answer citations are passed between internal components as plain JavaScript objects with implicit, undocumented structure. Citations sent in streaming SSE responses (`delta.custom_meta.citations`) are assembled inline. This makes it risky to add new metadata fields or change the retrieval backend without silently breaking downstream consumers.

#### Schemas to Create (`src/schemas/retrievalSchemas.js`)

```js
RetrievalHitSchema      // { _id, _score, _source: { text, metadata: { userId, originalFilename, uploadedAt, parentId? } } }
CitationSchema          // { id, source, score, text, uploadedAt? }
RetrievalResultSchema   // z.array(RetrievalHitSchema)
CitationListSchema      // z.array(CitationSchema)
```

#### Acceptance Criteria

- [ ] `rass-engine-service/src/schemas/retrievalSchemas.js` created with all four schemas
- [ ] Raw OpenSearch hits mapped through `RetrievalHitSchema.parse()` before use in `ask()`; invalid hits logged and excluded
- [ ] Citations validated against `CitationListSchema.parse()` before serialization in streaming and non-streaming paths
- [ ] All schemas exported from `src/schemas/index.js`
- [ ] `CitationSchema` documented in `mcp-server/openapi.yaml` (see #2.4)
- [ ] Unit tests covering: valid hit/citation, missing required field, extra metadata passthrough

#### Related Issues
`#1.2`, `#2.2`, `#2.4`

---

### Issue 2.4 — Generate OpenAPI 3.0 spec for public gateway endpoints

**Title:** `[Phase A][2.4] Generate OpenAPI 3.0 spec for public mcp-server gateway endpoints`
**Labels:** `enhancement`, `phase-a`, `documentation`

#### Summary

`mcp-server` exposes a REST API consumed by the frontend and any external integrations, but has no formal API documentation. This is a prerequisite for generating typed SDK clients, contract-driven integration testing, and onboarding new developers.

#### Endpoints to Document

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | Register new user |
| POST | `/api/auth/login` | None | Login, receive JWT |
| GET | `/api/chats` | Bearer | List user's chats |
| POST | `/api/chats` | Bearer | Create new chat |
| GET | `/api/chats/{chatId}` | Bearer | Get specific chat |
| PATCH | `/api/chats/{chatId}` | Bearer | Update chat title |
| DELETE | `/api/chats/{chatId}` | Bearer | Delete chat |
| GET | `/api/chats/{chatId}/messages` | Bearer | List messages |
| POST | `/api/chats/{chatId}/messages` | Bearer | Add message |
| POST | `/api/embed-upload` | Bearer | Upload document for indexing |
| GET | `/api/user-documents` | Bearer | List indexed documents |
| POST | `/api/stream-ask` | Bearer | Stream RAG response (SSE) |
| POST | `/api/chat/completions` | Bearer | OpenAI-compatible streaming chat |
| POST | `/api/transcribe` | Bearer | Transcribe audio via Whisper |

#### Acceptance Criteria

- [ ] `mcp-server/openapi.yaml` created — OpenAPI 3.0.3 spec covering all endpoints above
- [ ] Security scheme `BearerAuth` (HTTP Bearer JWT) defined
- [ ] Request body, response, and error schemas defined for all endpoints
- [ ] SSE endpoints documented with `text/event-stream` content type
- [ ] `CitationSchema` from Issue #2.3 referenced in response schemas
- [ ] Spec validated using `@apidevtools/swagger-parser` or `swagger-cli`
- [ ] Validation script added to `mcp-server/package.json`: `"validate:api": "swagger-cli validate openapi.yaml"`
- [ ] `mcp-server/README.md` updated to reference spec and explain how to view it locally
- [ ] (Stretch) Serve Swagger UI at `GET /api/docs` in non-production environments

#### Related Issues
`#1.3`, `#2.1`, `#2.3`

---

### Issue 2.5 — Add config schema validation using Zod

**Title:** `[Phase A][2.5] Add config schema validation using Zod`
**Labels:** `enhancement`, `phase-a`, `validation`, `dx`

#### Summary

`config.yml` is loaded without any schema validation. A typo in a provider name (`"Gemini"` instead of `"gemini"`), a missing required field, or an out-of-range numeric value (`EMBED_DIM: -1`) silently propagates into service logic—causing confusing runtime errors far from the root cause. This issue adds a Zod schema that validates the full `config.yml` at service startup.

#### Config Field Inventory

| Field | Type | Constraint |
|-------|------|-----------|
| `EMBEDDING_PROVIDER` | string | `"openai"` \| `"gemini"` |
| `LLM_PROVIDER` | string | `"openai"` \| `"gemini"` |
| `SEARCH_TERM_EMBEDDING_PROVIDER` | string | `"openai"` \| `"gemini"` |
| `OPENSEARCH_HOST` | string | min 1 |
| `OPENSEARCH_PORT` | number | int, 1–65535 |
| `OPENSEARCH_INDEX_NAME` | string | min 1 |
| `REDIS_HOST` | string | min 1 |
| `REDIS_PORT` | number | int, 1–65535 |
| `REDIS_DB` | number | int ≥ 0 |
| `EMBED_DIM` | number | int, positive |
| `PARENT_CHUNK_SIZE` | number | int, positive |
| `PARENT_CHUNK_OVERLAP` | number | int ≥ 0, < PARENT_CHUNK_SIZE |
| `CHILD_CHUNK_SIZE` | number | int, positive |
| `CHILD_CHUNK_OVERLAP` | number | int ≥ 0, < CHILD_CHUNK_SIZE |
| `DEFAULT_K_OPENSEARCH_HITS` | number | int, positive |
| `OPENSEARCH_SCORE_THRESHOLD` | number | 0–1 |
| `search.DEFAULT_TOP_K` | number | int, positive |
| Service ports | number | int, 1024–65535 |

#### Acceptance Criteria

- [ ] Create `rass-engine-service/src/schemas/configSchema.js` (or shared location) with `ConfigSchema` covering all fields above
- [ ] Cross-field validation: `PARENT_CHUNK_OVERLAP >= PARENT_CHUNK_SIZE` throws; `CHILD_CHUNK_OVERLAP >= CHILD_CHUNK_SIZE` throws
- [ ] Each service's `src/config.js` calls `ConfigSchema.parse(rawYaml)` on startup; failures print human-readable field errors and exit with code 1
- [ ] `config.yml` updated with inline comments documenting field types and constraints
- [ ] `config.example.yml` created as a reference template (tracked in git)
- [ ] Unit tests: valid config parses; wrong enum fails; negative dimension fails; missing field fails; invalid overlap fails

#### Related Issues
`#1.5`, `#2.1`

---

## Workflow Usage

To create all issues in GitHub, go to the **Actions** tab and run the **"Create Phase A Modernization Issues"** workflow:

1. Navigate to **Actions** → **Create Phase A Modernization Issues**
2. Click **Run workflow**
3. Set `dry_run` to `true` to preview, or `false` to create all 9 issues
4. Click **Run workflow**

The workflow requires the `issues: write` permission, which is granted via the `permissions` block in the workflow file.

---

## Issue Dependency Graph

```
Phase 1 (Modularization)         Phase 2 (Contracts)
─────────────────────────        ──────────────────────────────
1.1 embedding-service    ──┐
1.2 rass-engine-service  ──┤──→ 2.2 plannerSchemas
1.3 mcp-server           ──┤──→ 2.3 retrievalSchemas + citations ──→ 2.4 OpenAPI spec
1.5 config loading       ──┘──→ 2.5 config Zod schema
                              → 2.1 API payload validation (all services)
```
