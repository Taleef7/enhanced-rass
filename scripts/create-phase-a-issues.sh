#!/usr/bin/env bash
# scripts/create-phase-a-issues.sh
#
# Creates all Phase A modernization GitHub issues.
# Requires GH_TOKEN environment variable with issues:write permission.
#
# Usage:
#   GH_TOKEN=<token> bash scripts/create-phase-a-issues.sh
#
# Run via GitHub Actions:
#   Actions → "Create Phase A Modernization Issues" → Run workflow

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-Taleef7/enhanced-rass}"

create_issue() {
  local title="$1"
  local labels="$2"
  local body="$3"

  # Check if an issue with this title already exists
  local existing
  existing=$(gh issue list \
    --repo "$REPO" \
    --state all \
    --search "\"$title\"" \
    --json title \
    --limit 1000 \
    --jq '.[].title' 2>/dev/null | grep -Fx "$title" || true)

  if [[ -n "$existing" ]]; then
    echo "SKIP (already exists): $title"
    return
  fi

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --label "$labels" \
    --body "$body"
  echo "CREATED: $title"
  sleep 5
}

# ---------------------------------------------------------------------------
# Issue 1.1 — Refactor embedding-service/index.js into layered modules
# ---------------------------------------------------------------------------
read -r -d '' BODY_1_1 << 'EOF' || true
## Summary

The `embedding-service/index.js` is a 534-line monolith handling config loading, a
custom `RedisDocumentStore` class, Redis client setup, OpenSearch index management,
embedding provider initialization, document ingestion (PDF/DOCX/TXT parsing, parent/child
chunking, batch embedding), and all HTTP REST endpoints in a single file.

This makes the service hard to reason about, test in isolation, and extend with new
ingestion strategies or storage backends.

## Current Structure

```
embedding-service/
  index.js          ← 534 lines, all concerns mixed
  prisma/
  package.json
  Dockerfile
```

## Target Structure

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

## Acceptance Criteria

- [ ] `embedding-service/src/` directory created with the module structure above
- [ ] `RedisDocumentStore` class extracted to `src/store/redisDocumentStore.js`; public API unchanged
- [ ] Redis client setup (retry logic, SIGTERM/SIGINT handlers, `initializeDocstore()`) extracted to `src/clients/redisClient.js`
- [ ] OpenSearch client and `ensureIndexExists()` extracted to `src/clients/opensearchClient.js`
- [ ] Embedding provider factory (OpenAI vs. Gemini conditional) extracted to `src/clients/embedder.js`
- [ ] Document parsing and chunking extracted to `src/ingestion/`
- [ ] Each route handler extracted to its corresponding file under `src/routes/`
- [ ] `index.js` reduced to imports, route registration, and `app.listen()`
- [ ] All existing HTTP endpoints maintain their current behavior (no contract changes)
- [ ] No circular dependencies between modules
- [ ] Service starts and passes `GET /health` after refactor

## Related Issues

- Issue 1.2 — Refactor rass-engine-service
- Issue 1.3 — Refactor mcp-server
- Issue 1.5 — Centralized config loading
- Issue 2.1 — Zod validation for API payloads
EOF

create_issue \
  "[Phase A][1.1] Refactor embedding-service/index.js into layered modules" \
  "refactor,phase-a,good first issue" \
  "$BODY_1_1"

# ---------------------------------------------------------------------------
# Issue 1.2 — Refactor rass-engine-service into planner, retrieval, and generation modules
# ---------------------------------------------------------------------------
read -r -d '' BODY_1_2 << 'EOF' || true
## Summary

The `rass-engine-service` has its core RAG logic spread across `index.js` (433 lines)
plus standalone `hydeGenerator.js` and `executePlan.js` modules. The central `ask()`
function alone is 175 lines and mixes search planning, two-stage retrieval, LLM context
assembly, answer generation, and SSE streaming into a single flow.

Separating these concerns will make it possible to swap retrieval strategies, test
generation independently, and activate the currently-commented `createRefinedSearchPlan()`
integration cleanly.

## Current Structure

```
rass-engine-service/
  index.js            ← 433 lines: LLM init, embedder, planner, retrieval, generation, streaming, routes
  hydeGenerator.js    ← HyDE hypothetical document generation
  executePlan.js      ← multi-step plan execution against OpenSearch
  package.json
  Dockerfile
```

## Target Structure

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

## Acceptance Criteria

- [ ] `rass-engine-service/src/` directory created with the module structure above
- [ ] `hydeGenerator.js` and `executePlan.js` moved into `src/planner/` and `src/retrieval/` respectively
- [ ] `createRefinedSearchPlan()` extracted to `src/planner/searchPlanner.js`; existing TODO/commented-out integration point preserved with a clear comment
- [ ] `embedText()` extracted to `src/clients/embedder.js`
- [ ] LLM client initialization extracted to `src/clients/llmClient.js` with factory pattern for OpenAI/Gemini
- [ ] `writeSSE()` and streaming orchestration extracted to `src/generation/streaming.js`
- [ ] Non-streaming generation logic extracted to `src/generation/generator.js`
- [ ] Route handlers (`/ask`, `/stream-ask`) extracted to `src/routes/`
- [ ] `index.js` reduced to imports, route registration, and `app.listen()`
- [ ] POST `/ask` and POST `/stream-ask` maintain existing request/response contracts
- [ ] Service starts and responds correctly to a test query after refactor

## Related Issues

- Issue 1.1 — Refactor embedding-service
- Issue 1.3 — Refactor mcp-server
- Issue 1.5 — Centralized config loading
- Issue 2.2 — Zod schemas for planner output
- Issue 2.3 — Canonical schemas for retrieval hits and citations
EOF

create_issue \
  "[Phase A][1.2] Refactor rass-engine-service into planner, retrieval, and generation modules" \
  "refactor,phase-a" \
  "$BODY_1_2"

# ---------------------------------------------------------------------------
# Issue 1.3 — Refactor mcp-server into gateway, auth, chat, and proxy modules
# ---------------------------------------------------------------------------
read -r -d '' BODY_1_3 << 'EOF' || true
## Summary

`mcp-server/index.js` is a 464-line file combining: OpenAI-compatible chat proxy,
file upload proxy, audio transcription, streaming query proxy, OpenSearch user-document
aggregation, a legacy simple-ask endpoint, MCP tool definitions, and MCP transport
handling. Auth and chat routes are already extracted (`src/authRoutes.js`,
`src/chatRoutes.js`, `src/authMiddleware.js`), but the bulk of the gateway logic remains
in `index.js`.

## Current Structure

```
mcp-server/
  index.js              ← 464 lines (proxy + MCP tools + transport + misc)
  src/
    authRoutes.js        ← already extracted
    authMiddleware.js    ← already extracted
    chatRoutes.js        ← already extracted
  prisma/
  package.json
  Dockerfile
```

## Target Structure

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

## Acceptance Criteria

- [ ] `mcp-server/src/proxy/` and `mcp-server/src/gateway/` directories created
- [ ] Each proxy handler extracted to its own file:
  - `proxy/embedUpload.js` — multipart upload with userId injection
  - `proxy/streamAsk.js` — SSE stream proxy with auth
  - `proxy/chatCompletions.js` — OpenAI-compatible streaming proxy
  - `proxy/userDocuments.js` — OpenSearch aggregation with userId filter
  - `proxy/transcribe.js` — Whisper transcription proxy
- [ ] MCP tool definitions (`queryRASS`, `addDocumentToRASS`) extracted to `src/gateway/mcpTools.js`
- [ ] MCP transport (`POST /mcp`) handler extracted to `src/gateway/mcpTransport.js`
- [ ] Existing `src/authRoutes.js`, `src/authMiddleware.js`, `src/chatRoutes.js` left unchanged
- [ ] Legacy `POST /simple-ask` preserved or tagged `@deprecated` with a comment
- [ ] `index.js` reduced to app setup, middleware registration, route mounting, and `app.listen()`
- [ ] All existing API endpoints maintain their current request/response contracts
- [ ] Frontend continues to function correctly after refactor

## Related Issues

- Issue 1.1 — Refactor embedding-service
- Issue 1.2 — Refactor rass-engine-service
- Issue 1.5 — Centralized config loading
- Issue 2.1 — Zod validation for API payloads
- Issue 2.4 — OpenAPI spec for gateway endpoints
EOF

create_issue \
  "[Phase A][1.3] Refactor mcp-server into gateway, auth, chat, and proxy modules" \
  "refactor,phase-a" \
  "$BODY_1_3"

# ---------------------------------------------------------------------------
# Issue 1.5 — Add centralized config loading and validation utility per service
# ---------------------------------------------------------------------------
read -r -d '' BODY_1_5 << 'EOF' || true
## Summary

All three services load `config.yml` identically via raw `js-yaml` with no validation:

```js
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const { OPENSEARCH_HOST, EMBED_DIM, ... } = config;
```

There is no type checking, required-field validation, or default value enforcement.
A missing or mistyped key silently produces `undefined`, which propagates into service
logic and causes cryptic runtime errors. A wrong provider enum (e.g., `"Gemini"` instead
of `"gemini"`) silently falls through to an unrecognized branch.

This issue creates a `src/config.js` module in each service that owns all config loading
and exposes validated, named exports. Issue 2.5 adds the Zod schema layer on top of this.

## Acceptance Criteria

- [ ] Create `embedding-service/src/config.js`:
  - Reads `./config.yml` using `js-yaml`
  - Validates config using the shared config schema (see Issue 2.5)
  - Exports named constants used by this service (e.g., `OPENSEARCH_HOST`, `EMBED_DIM`, `EMBEDDING_PROVIDER`, chunk sizes, etc.)
  - Throws a descriptive error with the invalid field names if validation fails, causing `process.exit(1)` before the server binds a port

- [ ] Create `rass-engine-service/src/config.js` with same pattern, exporting the fields this service uses (`LLM_PROVIDER`, `OPENSEARCH_*`, `DEFAULT_K_OPENSEARCH_HITS`, model names, etc.)

- [ ] Create `mcp-server/src/config.js` with same pattern, exporting `MCP_SERVER_PORT`, `OPENSEARCH_*`, etc.

- [ ] Each service's `index.js` (after Issues 1.1–1.3) imports from `./src/config.js` instead of loading YAML directly

- [ ] Config loading is tested: a unit test for each service's `config.js` that:
  - Verifies valid `config.yml` parses successfully
  - Verifies a config with a missing required field throws a descriptive error

- [ ] `config.yml` annotated with inline comments describing each field's type and allowed values

## Notes

- This issue depends on Issues 1.1, 1.2, and 1.3 for the `src/` directory to exist
- Issue 2.5 extends this by adding Zod schema validation to the same `config.js` modules

## Related Issues

- Issue 1.1 — Refactor embedding-service
- Issue 1.2 — Refactor rass-engine-service
- Issue 1.3 — Refactor mcp-server
- Issue 2.5 — Config schema validation using Zod
EOF

create_issue \
  "[Phase A][1.5] Add centralized config loading and validation utility per service" \
  "refactor,phase-a,dx" \
  "$BODY_1_5"

# ---------------------------------------------------------------------------
# Issue 2.1 — Introduce Zod schema validation for all external API payloads
# ---------------------------------------------------------------------------
read -r -d '' BODY_2_1 << 'EOF' || true
## Summary

All three services accept external HTTP input but validate it with ad-hoc conditional
checks scattered through route handlers:

```js
// embedding-service
if (!userId) return res.status(400).json({ error: 'Missing userId...' });
if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded.' });

// rass-engine-service
if (!query?.trim()) throw new Error('Empty query');

// mcp-server
if (!query || !userId) return res.status(400).json({ error: 'Missing...' });
```

There is no centralized validation, no schema documentation, and error messages are
inconsistent. `mcp-server` already depends on `zod` (used only for MCP tool definitions),
but the REST endpoints do not leverage it.

## Target

Consistent, schema-driven request validation via reusable middleware across all services.

## Acceptance Criteria

### Middleware

- [ ] Create reusable `validateBody(schema)` Express middleware in each service (or shared `src/middleware/validate.js`):
  - Calls `schema.safeParse(req.body)`
  - On failure: returns `{ error: 'Validation failed', details: zodError.issues }` with HTTP 400
  - On success: attaches `req.validatedBody` (parsed/coerced values) and calls `next()`

- [ ] Create matching `validateQuery(schema)` for query-string validation

### Schemas per endpoint

- [ ] **embedding-service** — `src/schemas/uploadSchema.js`:
  - `UploadBodySchema`: `userId` — non-empty string

- [ ] **rass-engine-service** — `src/schemas/askSchema.js`:
  - `AskBodySchema`: `query` non-empty string; `top_k` optional positive int; `userId` optional string
  - `StreamAskBodySchema`: same but `userId` is **required**

- [ ] **mcp-server** — `src/schemas/`:
  - `EmbedUploadSchema`: `userId` non-empty string
  - `StreamAskBodySchema`: `query` non-empty string; `top_k` optional positive int
  - `ChatCompletionsBodySchema`: `messages` non-empty array; last message has `role: 'user'` and `content` string
  - `UserDocumentsQuerySchema`: `page` optional positive int; `limit` optional int (1–100)

### Dependencies

- [ ] Add `zod` to `embedding-service` and `rass-engine-service` `package.json`

### Testing

- [ ] At least one test per schema verifying:
  - Valid input passes and attaches `req.validatedBody`
  - Missing required field returns HTTP 400 with `details` array
  - Wrong type (e.g., `top_k: 'ten'`) returns HTTP 400

## Related Issues

- Issue 1.1 — Refactor embedding-service
- Issue 1.2 — Refactor rass-engine-service
- Issue 1.3 — Refactor mcp-server
- Issue 2.2 — Schemas for planner output
- Issue 2.5 — Config schema validation
EOF

create_issue \
  "[Phase A][2.1] Introduce Zod schema validation for all external API payloads" \
  "enhancement,phase-a,validation" \
  "$BODY_2_1"

# ---------------------------------------------------------------------------
# Issue 2.2 — Define shared Zod schemas for planner output and retrieval steps
# ---------------------------------------------------------------------------
read -r -d '' BODY_2_2 << 'EOF' || true
## Summary

`rass-engine-service` uses an LLM to generate a structured search plan. The plan output
is currently parsed with a bare `JSON.parse()` with no schema enforcement:

```js
// Current code in createRefinedSearchPlan() — no validation
const refinedTerms = JSON.parse(rawPlan);
```

Similarly, `executePlan.js` accepts an array of plan steps with no formal schema.
If the LLM returns malformed JSON or an unexpected structure, the error surfaces deep in
the retrieval pipeline rather than at the boundary.

## Schemas to Create (`src/schemas/plannerSchemas.js`)

```js
// A single refined search term from the LLM
const SearchTermSchema = z.string().min(1).max(500);

// The full search plan — array of 1–10 search terms
const SearchPlanSchema = z.array(SearchTermSchema).min(1).max(10);

// A single step passed to executePlan()
const PlanStepSchema = z.object({
  query: z.string().min(1),
  method: z.enum(['knn', 'bm25', 'hybrid']).default('hybrid'),
  top_k: z.number().int().positive().optional(),
});

// A full execution plan
const ExecutionPlanSchema = z.array(PlanStepSchema).min(1);
```

## Acceptance Criteria

- [ ] `rass-engine-service/src/schemas/plannerSchemas.js` created with all four schemas above

- [ ] `createRefinedSearchPlan()` (in `src/planner/searchPlanner.js` after Issue 1.2) validates LLM output:
  - Calls `SearchPlanSchema.safeParse(JSON.parse(rawOutput))`
  - On validation failure: logs the error and falls back to `[originalQuery]`

- [ ] `executePlan.js` validates its input plan at entry using `ExecutionPlanSchema.parse()` and throws a descriptive error on failure

- [ ] All schemas exported from `src/schemas/index.js`

- [ ] Unit tests covering:
  - Valid plan arrays pass `SearchPlanSchema`
  - Empty array fails with `min(1)` error
  - Array of 11 items fails with `max(10)` error
  - Invalid step method fails `PlanStepSchema`
  - Valid plan steps pass `ExecutionPlanSchema`

## Related Issues

- Issue 1.2 — Refactor rass-engine-service
- Issue 2.1 — Zod validation for API payloads
- Issue 2.3 — Canonical schemas for retrieval hits and citations
EOF

create_issue \
  "[Phase A][2.2] Define shared Zod schemas for planner output and retrieval steps" \
  "enhancement,phase-a,validation" \
  "$BODY_2_2"

# ---------------------------------------------------------------------------
# Issue 2.3 — Define canonical schemas for retrieval hits and citations
# ---------------------------------------------------------------------------
read -r -d '' BODY_2_3 << 'EOF' || true
## Summary

OpenSearch retrieval results (hits) and LLM answer citations are passed between internal
components as plain JavaScript objects with implicit, undocumented structure. Currently:

- Raw OpenSearch hits are used directly as `source_documents` in API responses with no type guarantee
- Citations sent in streaming SSE responses (`delta.custom_meta.citations`) are assembled inline with an ad-hoc structure
- The frontend and any API consumer must infer the schema by reading source code

This fragility makes it risky to add new metadata fields (reranker scores, page numbers,
confidence levels) or change the retrieval backend without silently breaking downstream consumers.

## Schemas to Create (`src/schemas/retrievalSchemas.js`)

```js
const RetrievalHitSchema = z.object({
  _id: z.string(),
  _score: z.number(),
  _source: z.object({
    text: z.string(),
    metadata: z.object({
      userId: z.string(),
      originalFilename: z.string(),
      uploadedAt: z.string(),
      parentId: z.string().optional(),
    }).passthrough(), // allow additional metadata fields
  }),
});

const CitationSchema = z.object({
  id: z.string(),
  source: z.string(),       // document filename or title
  score: z.number(),
  text: z.string(),         // relevant excerpt
  uploadedAt: z.string().optional(),
});

const RetrievalResultSchema = z.array(RetrievalHitSchema);
const CitationListSchema = z.array(CitationSchema);
```

## Acceptance Criteria

- [ ] `rass-engine-service/src/schemas/retrievalSchemas.js` created with all four schemas

- [ ] Raw OpenSearch hits mapped through `RetrievalHitSchema.parse()` before use in `ask()`; invalid hits are logged and excluded from context rather than crashing

- [ ] Citations assembled for both streaming and non-streaming responses are validated against `CitationListSchema.parse()` before serialization

- [ ] All schemas exported from `src/schemas/index.js`

- [ ] `CitationSchema` documented in `mcp-server/openapi.yaml` (see Issue 2.4) and in `docs/PLANNER_AND_DIAGRAMS.md`

- [ ] Unit tests covering:
  - Valid OpenSearch hit passes `RetrievalHitSchema`
  - Hit missing `_source.text` fails with descriptive error
  - Valid citation passes `CitationSchema`
  - Citation missing `source` fails
  - Extra metadata fields on `_source.metadata` are preserved by `.passthrough()`

## Related Issues

- Issue 1.2 — Refactor rass-engine-service
- Issue 2.2 — Schemas for planner output
- Issue 2.4 — OpenAPI spec for gateway endpoints
EOF

create_issue \
  "[Phase A][2.3] Define canonical schemas for retrieval hits and citations" \
  "enhancement,phase-a,validation" \
  "$BODY_2_3"

# ---------------------------------------------------------------------------
# Issue 2.4 — Generate OpenAPI spec for public gateway endpoints
# ---------------------------------------------------------------------------
read -r -d '' BODY_2_4 << 'EOF' || true
## Summary

`mcp-server` exposes a REST API consumed by the frontend and any external integrations,
but has no formal API documentation. There is no OpenAPI spec, no shared request/response
type definitions, and no way for API consumers to understand the available endpoints
without reading `index.js` line by line.

This is a prerequisite for:
- Generating typed SDK clients (e.g., TypeScript `fetch` wrappers for the frontend)
- Contract-driven integration testing
- Onboarding new developers without source-code archaeology
- Connecting external tools (e.g., Postman, Insomnia, OpenAPI Explorer)

## Endpoints to Document

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

## Acceptance Criteria

- [ ] Create `mcp-server/openapi.yaml` — an **OpenAPI 3.0.3** specification covering all endpoints listed above

- [ ] Security scheme `BearerAuth` (HTTP Bearer JWT) defined and applied to all protected endpoints

- [ ] Request body, response schema (success + error), and status codes defined for every endpoint

- [ ] SSE endpoints documented with `text/event-stream` content type and example event format

- [ ] `CitationSchema` from Issue 2.3 referenced in response schemas for `/api/stream-ask` and `/api/chat/completions`

- [ ] Error response schema defined and reused: `{ error: string, details?: object[] }`

- [ ] Spec validated against OpenAPI 3.0 schema:
  - Add `@apidevtools/swagger-parser` or `swagger-cli` as a dev dependency
  - Add `"validate:api": "swagger-cli validate openapi.yaml"` to `mcp-server/package.json` scripts

- [ ] `mcp-server/README.md` updated to reference `openapi.yaml` with instructions for local viewing (e.g., Swagger UI via Docker or Stoplight Studio)

- [ ] _(Stretch)_ Serve Swagger UI at `GET /api/docs` in non-production environments using `swagger-ui-express`

## Related Issues

- Issue 1.3 — Refactor mcp-server
- Issue 2.1 — Zod validation for API payloads
- Issue 2.3 — Canonical schemas for retrieval hits and citations
EOF

create_issue \
  "[Phase A][2.4] Generate OpenAPI 3.0 spec for public mcp-server gateway endpoints" \
  "enhancement,phase-a,documentation" \
  "$BODY_2_4"

# ---------------------------------------------------------------------------
# Issue 2.5 — Add config schema validation using Zod
# ---------------------------------------------------------------------------
read -r -d '' BODY_2_5 << 'EOF' || true
## Summary

`config.yml` is the central configuration file for all three services and contains 25+
distinct fields, but it is loaded without any schema validation. A typo in a provider
name (`"Gemini"` instead of `"gemini"`), a missing required field, or an out-of-range
numeric value (`EMBED_DIM: -1`) silently propagates into service logic—causing confusing
runtime errors far from the root cause.

This issue adds a Zod schema that validates the full `config.yml` at service startup.
It extends Issue 1.5 (centralized config loading) with type safety.

## `config.yml` Field Inventory

| Field | Type | Constraint |
|-------|------|-----------|
| `EMBEDDING_PROVIDER` | string | `"openai"` or `"gemini"` |
| `LLM_PROVIDER` | string | `"openai"` or `"gemini"` |
| `SEARCH_TERM_EMBEDDING_PROVIDER` | string | `"openai"` or `"gemini"` |
| `OPENSEARCH_HOST` | string | min length 1 |
| `OPENSEARCH_PORT` | number | integer, 1–65535 |
| `OPENSEARCH_INDEX_NAME` | string | min length 1 |
| `REDIS_HOST` | string | min length 1 |
| `REDIS_PORT` | number | integer, 1–65535 |
| `REDIS_DB` | number | integer >= 0 |
| `EMBED_DIM` | number | integer, positive |
| `PARENT_CHUNK_SIZE` | number | integer, positive |
| `PARENT_CHUNK_OVERLAP` | number | integer >= 0, < PARENT_CHUNK_SIZE |
| `CHILD_CHUNK_SIZE` | number | integer, positive |
| `CHILD_CHUNK_OVERLAP` | number | integer >= 0, < CHILD_CHUNK_SIZE |
| `DEFAULT_K_OPENSEARCH_HITS` | number | integer, positive |
| `OPENSEARCH_SCORE_THRESHOLD` | number | 0–1 |
| `search.DEFAULT_TOP_K` | number | integer, positive |
| Service ports | number | integer, 1024–65535 |

## Acceptance Criteria

- [ ] Create `rass-engine-service/src/schemas/configSchema.js` (or a shared location) with a `ConfigSchema` covering all fields listed above

- [ ] Cross-field validation:
  - `PARENT_CHUNK_OVERLAP >= PARENT_CHUNK_SIZE` → throw with message `"PARENT_CHUNK_OVERLAP must be less than PARENT_CHUNK_SIZE"`
  - `CHILD_CHUNK_OVERLAP >= CHILD_CHUNK_SIZE` → same pattern

- [ ] Each service's `src/config.js` (from Issue 1.5) calls `ConfigSchema.parse(rawYaml)` on startup:
  - On success: exports the validated, type-safe config object
  - On failure: prints each `ZodError` issue in human-readable format and calls `process.exit(1)` before the server binds a port

- [ ] `config.yml` updated with inline comments documenting each field's type, constraints, and allowed values

- [ ] Create `config.example.yml` (tracked in git) as a reference template with all fields documented

- [ ] Unit tests:
  - Valid `config.yml` parses without error
  - Wrong provider enum (`"Gemini"`) fails with descriptive message
  - Negative `EMBED_DIM` fails
  - Missing required field fails
  - `PARENT_CHUNK_OVERLAP >= PARENT_CHUNK_SIZE` fails cross-field validation
  - `CHILD_CHUNK_OVERLAP >= CHILD_CHUNK_SIZE` fails cross-field validation

## Related Issues

- Issue 1.5 — Centralized config loading
- Issue 2.1 — Zod validation for API payloads
EOF

create_issue \
  "[Phase A][2.5] Add config schema validation using Zod" \
  "enhancement,phase-a,validation,dx" \
  "$BODY_2_5"

echo ""
echo "Phase A issue creation complete."
echo "Visit https://github.com/${REPO}/issues to see all created issues."
