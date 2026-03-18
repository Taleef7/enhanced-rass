# RASS Getting Started

This guide walks through the current end-to-end path for running and using RASS locally.

It is written against the code and compose files that exist now:

- backend stack from the repo-root `docker-compose.yml`
- frontend run separately from `frontend/`
- main API surface on `http://localhost:8080`

## What You Are Starting

RASS currently runs as a multi-service RAG platform:

- `mcp-server`: auth, API gateway, chat persistence, document registry, knowledge-base and workspace APIs
- `rass-engine-service`: retrieval and answer generation
- `embedding-service`: async ingestion, chunking, embedding, indexing, provenance
- `frontend`: React chat UI
- infra: OpenSearch, Redis, Postgres, Jaeger, Prometheus, Grafana, Loki, Promtail, optional Ollama

The default local-development path is:

1. start the backend stack with Docker
2. run the frontend separately with Node.js
3. use the browser UI for chat and document flows
4. use Swagger or direct API calls for backend-first platform features

## Prerequisites

Install these first:

- Docker Desktop with Docker Compose support
- Node.js 18 or newer
- npm
- Git

You also need one of these provider setups:

- local Ollama models for the most reliable local path
- `GEMINI_API_KEY` plus enabled billing/quota if you want Gemini
- `OPENAI_API_KEY` if you want OpenAI instead

## Step 1: Clone And Prepare The Repo

```bash
git clone https://github.com/Taleef7/enhanced-rass.git
cd enhanced-rass
```

Create the shared Docker network once:

```bash
docker network create shared_rass_network
```

## Step 2: Create The Root `.env`

Create a root `.env` file. At minimum, set:

```env
JWT_SECRET=replace-me
REFRESH_TOKEN_SECRET=replace-me-too
```

Add provider secrets only for the providers you actually use:

```env
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

Additional values you may need depending on your workflow:

```env
GRAFANA_ADMIN_PASSWORD=admin
RASS_ENGINE_URL=http://localhost:8000
EMBEDDING_SERVICE_URL=http://localhost:8001
```

Notes:

- you do not need both Gemini and OpenAI keys if you only use one provider
- if you change JWT secrets, existing sessions become invalid
- do not place secrets in `config.yml`

## Step 3: Review `config.yml`

The repo-root [config.yml](C:\Users\talee\OneDrive - Higher Education Commission\projects\enhanced-rass\config.yml) is the shared non-secret runtime config for backend services.

The most important fields are:

- ports:
  - `MCP_SERVER_PORT: 8080`
  - `RASS_ENGINE_PORT: 8000`
  - `EMBEDDING_SERVICE_PORT: 8001`
- providers:
  - `EMBEDDING_PROVIDER`
  - `LLM_PROVIDER`
  - `SEARCH_TERM_EMBEDDING_PROVIDER`
- retrieval and chunking:
  - `CHUNKING_STRATEGY`
  - `PARENT_CHUNK_SIZE`
  - `CHILD_CHUNK_SIZE`
  - `DEFAULT_K_OPENSEARCH_HITS`
  - `search.DEFAULT_TOP_K`
- model alignment:
  - `EMBED_DIM`
- optional features:
  - `HYDE_ENABLED`
  - `RERANK_PROVIDER`
  - `FEEDBACK_BOOST_ENABLED`
  - `VISION_ENABLED`
  - Ollama settings

Important: `EMBED_DIM` must match the active embedding model. If you change embedding models or dimensions, re-create the target OpenSearch index before re-ingesting content.

## Step 4: Start The Backend Stack

From the repo root:

```bash
docker compose up -d --build
```

If you are using a Unix-like shell, `./scripts/start.sh` runs the same command.

This starts:

- `mcp-server` on `8080`
- `rass-engine-service` on `8000`
- `embedding-service` on `8001`
- OpenSearch on `9200`
- Redis on `6379`
- Postgres on `5432`
- Jaeger on `16686`
- Prometheus on `9090`
- Grafana on `3001`
- Loki on `3100`
- Ollama on `11434`

Important: the root stack does not start the normal frontend.

## Step 5: Verify The Stack

Check these endpoints:

- health: `http://localhost:8080/api/health`
- Swagger UI: `http://localhost:8080/api/docs`
- queue dashboard: `http://localhost:8001/admin/queues`
- Jaeger: `http://localhost:16686`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

Useful log commands:

```bash
docker compose logs -f
docker compose logs -f mcp-server
docker compose logs -f rass-engine-service
docker compose logs -f embedding-service
```

## Step 6: Start The Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm start
```

Open:

- `http://localhost:3000`

The frontend proxies API traffic to:

- `http://localhost:8080/api`

## Step 7: Create An Account And Log In

On the login page:

1. register a username and password
2. sign in
3. let the app restore the session automatically on later reloads

Current auth behavior:

- the JWT is stored in memory in the React app
- the refresh token is stored as an HTTP-only cookie
- the app silently calls `POST /api/auth/refresh` on load

Expected behavior:

- a refresh-friendly page reload should keep you signed in
- if the refresh token expires or becomes invalid, you will need to log in again

## Step 8: Create Your First Chat

Once logged in:

1. click `New chat` in the sidebar
2. select the new conversation
3. use the main prompt box to ask questions or upload files

Chat behavior to expect:

- chats are persisted through `mcp-server`
- chat titles are auto-generated from the first user message
- the frontend keeps a local fallback cache in `localStorage` if the server is unavailable

## Step 9: Upload Documents

Use the paperclip button in the chat input, or drag and drop a file into the input area.

Current commonly supported file types:

- `.pdf`
- `.txt`
- `.md`
- `.doc`
- `.docx`

OCR for image-based content is only available when `VISION_ENABLED: true`.

What happens after upload:

1. the frontend sends the file to `mcp-server`
2. `mcp-server` creates the document record with `QUEUED` status
3. the file is proxied to `embedding-service`
4. `embedding-service` writes it to disk and enqueues a BullMQ ingestion job
5. the worker parses, chunks, embeds, indexes, and stores provenance
6. `mcp-server` is updated with final status and ETL metadata

Document states you will see:

- `QUEUED`
- `PROCESSING`
- `READY`
- `FAILED`
- `DELETED`

Important: a successful upload request only means the job was accepted. The document is not usable for retrieval until it reaches `READY`.

## Step 10: Ask Questions

Once a document is ready:

1. type a question in the chat box
2. press `Enter` or click send
3. wait for streaming to begin

What RASS does on each question:

1. forwards the query through `mcp-server` to `rass-engine-service`
2. runs the staged retrieval pipeline
3. streams retrieved context first
4. streams answer text token by token
5. sends structured citations at the end

The active retrieval pipeline is:

1. `HydeQueryExpansionStage`
2. `EmbedQueryStage`
3. `HybridSearchStage`
4. `ParentFetchStage`
5. `DeduplicateStage`
6. `RerankStage`
7. `FeedbackBoostStage`
8. `TopKSelectStage`

Expected behavior:

- the assistant response appears progressively
- citations are attached after the answer stream finishes
- if retrieval returns nothing useful, you may get a fallback-style answer with empty citations

## Step 11: Inspect Context And Citations

Use the sparkle icon in chat to open the "What CoRAG is thinking" panel.

That panel shows:

- retrieved chunks
- retrieval scores
- document names
- the current retrieval state while streaming

This is useful for:

- checking whether the right documents were selected
- diagnosing weak retrieval quality
- understanding why a citation appeared in the answer

## Step 12: Manage Documents

RASS currently has two document views:

- the chat-side document panel
- the fuller document manager flow

Use these to:

- list available documents
- inspect status
- open ETL provenance for ready documents
- delete a document

Important deletion behavior:

- deletion is a soft-delete plus best-effort search cleanup
- it should not be treated as an immediate deep purge of every backing store
- Redis parent chunks are not comprehensively purged in the normal delete flow

## Step 13: Use Voice Input

The chat input supports microphone capture if your browser allows it.

Expected flow:

1. click the microphone icon
2. allow mic permissions
3. speak
4. stop recording
5. let the app transcribe and place the text into the prompt box

Notes:

- live preview uses browser speech recognition if available
- the recorded audio is then sent through the backend transcription path
- browser support varies

## Step 14: Explore The Backend-First Features

Some RASS capabilities are more complete at the API layer than in the default frontend.

Use Swagger at `http://localhost:8080/api/docs` to explore:

- knowledge bases
- organizations
- workspaces
- API keys
- audit and admin routes
- annotations
- retrieval feedback
- entity/relation knowledge graph endpoints
- MCP transport routes

This is the right way to explore multi-tenant and platform-style capabilities today.

## Step 15: Use API Keys For Programmatic Access

RASS supports machine access with API keys.

Use:

```http
Authorization: ApiKey rass_...
```

Do not use `X-Api-Key`; that is from older docs and is not the canonical current header.

## Step 16: Use Observability Services

When debugging or evaluating the system:

- Jaeger shows distributed traces
- Prometheus exposes metrics
- Grafana visualizes dashboards
- Loki and Promtail aggregate logs
- Bull Board shows ingestion queue activity

Useful cases:

- uploads stuck in `QUEUED` or `PROCESSING`
- retrieval latency spikes
- provider/API errors
- health drift between services

## Optional: Run The Demo Stack

If you want the demo-specific flow:

```bash
./scripts/demo.sh
```

Or on Windows/Git Bash:

```bash
bash scripts/demo.sh
```

The demo stack is useful for showcase scenarios, but it is not the canonical development path. The most reliable baseline is still:

1. root backend compose
2. local frontend dev server

## Recommended: Run Fully Local With Ollama

RASS includes an Ollama container for local models.

To use it:

1. ensure the `ollama` service is running
2. pull the required models:
   ```bash
   bash scripts/ollama-pull-models.sh
   ```
3. update `config.yml`:
   - `EMBEDDING_PROVIDER: ollama`
   - `LLM_PROVIDER: ollama`
   - `SEARCH_TERM_EMBEDDING_PROVIDER: ollama`
   - set `OLLAMA_LLM_MODEL`
   - set `OLLAMA_EMBED_MODEL`
4. set `EMBED_DIM: 768` for `nomic-embed-text`
5. re-ingest documents if you changed embedding settings

This is the best local-development baseline because it avoids hosted-provider quota and billing failures.

## Gemini Setup Checklist

Use Gemini only after the local path is stable.

1. Create or select the correct project in Google AI Studio.
2. Generate the server-side API key and place it in the root `.env` as `GEMINI_API_KEY`.
3. Enable billing / paid tier for the project if the selected model requires it.
4. Verify the project has quota for both:
   - `gemini-2.0-flash`
   - `gemini-embedding-001`
5. Set in `config.yml`:
   - `EMBEDDING_PROVIDER: gemini`
   - `LLM_PROVIDER: gemini`
   - `SEARCH_TERM_EMBEDDING_PROVIDER: gemini`
   - `GEMINI_EMBED_MODEL_NAME: gemini-embedding-001`
   - `GEMINI_MODEL_NAME: gemini-2.5-flash`
   - `EMBED_DIM: 3072`
6. Re-ingest documents after changing embedding provider or dimension.

Notes:

- keep the Gemini API key only in `.env`; never expose it in the browser
- if retrieval works but generation fails with `429`, the usual cause is missing billing or zero quota on the selected Gemini model

## Common Troubleshooting

### The backend will not start

Check:

- Docker Desktop is running
- `shared_rass_network` exists
- required ports are free
- your `.env` is present

### OpenSearch fails or behaves oddly

On Linux you may need:

```bash
sudo sysctl -w vm.max_map_count=262144
```

### Uploads stay queued

Check:

```bash
docker compose logs -f embedding-service
docker compose exec redis redis-cli ping
```

### Answers fail after retrieval

Check:

- API keys for the selected provider
- `LLM_PROVIDER` in `config.yml`
- `rass-engine-service` logs

### Retrieval quality looks wrong

Check:

- whether documents are actually `READY`
- whether the context panel shows the expected source chunks
- whether `EMBED_DIM` matches the embedding model
- whether you changed providers without re-ingesting documents

### Multi-tenant retrieval does not behave as expected

Current caveat: KB/workspace ingestion can target different indices, but the active retrieval stage still uses the configured default OpenSearch index. Treat that as a known current limitation.

## Current Caveats You Should Know Before Relying On A Feature

- the root compose stack does not start the standard frontend
- the personal chat-plus-documents path is the most reliable full UX
- shared chat exists in the repo but is not fully aligned end to end
- the repo contains both an older document-similarity graph concept and newer entity/relation graph APIs
- some frontend components still contain legacy assumptions, even though the canonical auth flow is the in-memory JWT plus refresh-cookie model

## Next Reading

- [README.md](C:\Users\talee\OneDrive - Higher Education Commission\projects\enhanced-rass\README.md)
- [DEPLOYMENT.md](C:\Users\talee\OneDrive - Higher Education Commission\projects\enhanced-rass\DEPLOYMENT.md)
- [docs/user-guide.md](C:\Users\talee\OneDrive - Higher Education Commission\projects\enhanced-rass\docs\user-guide.md)
- [docs/api/streaming.md](C:\Users\talee\OneDrive - Higher Education Commission\projects\enhanced-rass\docs\api\streaming.md)
