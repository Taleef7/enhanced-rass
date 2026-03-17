# RASS Stabilization Work Log

## Goal
Bring the application to a working, testable end-to-end state across the core RAG flow first, then secondary surfaces.

## Verified Working
- Backend stack builds and starts with the current local configuration.
- Frontend builds successfully.
- Frontend now uses a single shared RASS theme across auth, workspace, and shared-chat routes.
- The workspace shell is responsive at mobile, tablet, laptop, and desktop widths.
- The evidence rail is persistent on wide screens and becomes a right-side drawer on smaller screens.
- The document library, citations, composer, and guided tour all use the same surface and state system.
- User registration and login work.
- Chat creation works.
- Document upload works and reports queued ingestion correctly.
- Ingestion reaches `READY`.
- Retrieval and streamed generation work with Gemini after updating to `gemini-2.5-flash`.
- Citations render and expand correctly.
- Feedback submission works.
- Annotation creation works end to end.
- Shared chat link creation works.
- Shared chat read-only page works from a public route.
- Shared chat data can be fetched without credentials.
- Knowledge base creation works.
- KB-scoped document upload and ingestion work.
- Similarity graph generation works for KB documents.
- Entity and relation extraction works through the graph API.

## Issues Found And Addressed
- Dockerfiles required missing `package-lock.json` files.
- OpenTelemetry startup used a promise-style `catch()` against a void return.
- Frontend proxy/base URL setup was brittle for local development.
- Upload UX incorrectly claimed a document was immediately ready.
- Shared chat route data fields mismatched the Prisma schema.
- Shared link generation used the API host instead of the frontend host.
- Knowledge graph similarity route collided with the entity graph route.
- OpenAPI validation blocked implemented Phase G share and graph routes in dev.
- Knowledge graph extraction expected a nonexistent `DocumentProvenance.chunkText` field.
- Knowledge graph extraction depended on `/ask` with `top_k: 0`, which was not a valid or reliable prompt-only path.
- Search-term Ollama embeddings were not implemented in the retrieval client.
- Gemini model default targeted a retired model.
- The sidebar drawer behaved as a modal overlay and intercepted chat clicks.
- Auth, chat, citations, context, and shared-chat surfaces had drifted into raw colors, mixed spacing, and inconsistent panel behavior.
- The top-level document badge counted only in-memory chat attachments instead of the real document library.
- The active chat document status did not refresh after ingestion began, leaving upload chips visually stuck in `QUEUED`.
- Guided-tour targets depended on hidden sidebar content instead of always-visible controls.

## Audit & Improvement Pass (March 2026)

A comprehensive codebase audit produced a prioritised roadmap. The following items from Phase 1 and Phase 2 are now complete:

### Quick Wins — done
- **Configurable LLM token limit**: `LLM_MAX_TOKENS: 2048` added to `config.yml`; `generator.js` and `streaming.js` no longer hardcode 500.
- **Dead component removal**: `DocumentCard`, `DocumentList`, `DocumentManager`, `Header`, `HealthIndicator`, and `UploadManager` deleted — none were imported by active code.
- **HTTP security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-XSS-Protection`, and production-only `Strict-Transport-Security` added to both `mcp-server` and `rass-engine-service`.

### Phase 1 — Safety Net — done
- **GitHub Actions CI** at `.github/workflows/ci.yml`: runs test + build for all four services on every push and PR to `main`. All 4 jobs pass (mcp-server, rass-engine-service, embedding-service, frontend test + build).
- **Test fixes**: updated `KBCreateSchema` test to reflect intentional provider-agnostic model name change; added `kbId` UUID validation test.
- **Frontend lockfile**: `frontend/package-lock.json` committed to repo (`.gitignore` exception added) to ensure reproducible builds on CI. `react-scripts@5` has conflicting transitive ajv/schema-utils versions without a lockfile.
- **Eval regression gate**: `.github/workflows/eval-regression-gate.yml` fixed — invalid UTF-8 surrogate pairs (emoji stored as UTF-16) were causing GitHub to fail to parse the workflow YAML.
- **Weekly eval workflow**: `.github/workflows/weekly-eval.yml` added — runs full 22-question suite on Mondays and on manual dispatch; commits results to `evaluation/results/`.

### Phase 2 — Core UX — done
- **Document deletion**: DELETE button with confirmation dialog in `DocumentPanel`; calls `DELETE /api/documents/:id` and refreshes list.
- **Streaming SSE reconnect**: `streamQuery` retries up to 3× with exponential backoff (1 s, 2 s, 4 s); 4xx not retried.
- **Knowledge Base selector**: KB dropdown in Sidebar; `activeKbId` in `ChatContext`; `kbId` passed through stream-ask proxy (UUID-validated in schema).
- **Guided Tour help button**: `?` icon in AppBar triggers `GuidedTour` on click.
- **Response length control**: Brief / Standard / Detailed toggle in `ChatInput` appends a natural-language length instruction to the query.

### Remaining (Phase 3–5)
- O(1) API key lookup (hash index on `apiKeyHash` in Postgres).
- Redis query-result cache for repeated (query + KB) pairs.
- Per-route rate limiting on `/ask`, `/upload`, `/generate`.
- Server-side cursor pagination for document library.
- Evaluation harness wired to CI nightly.
- KB management UI (create, delete, member invite from the frontend).
- KG decision: integrate entity graph as sidebar panel or remove KG code.
- SAML/OIDC SSO, RBAC per KB, document connectors (Phase 5).
