# MCP Server

Gateway for REST + MCP tools. Injects userId from JWT and proxies to backend services.

## REST API Documentation

The full REST API is documented in **[`openapi.yaml`](./openapi.yaml)** (OpenAPI 3.0.3).

### Viewing the API Documentation

**Option 1 — Interactive Swagger UI (built-in, non-production)**

When running the server with `NODE_ENV` not set to `production`, Swagger UI is served at:

```
http://localhost:8080/api/docs
```

**Option 2 — Stoplight Studio (recommended for offline use)**

1. Install [Stoplight Studio](https://stoplight.io/studio)
2. Open `mcp-server/openapi.yaml`
3. Browse and try endpoints interactively

**Option 3 — Swagger UI via Docker**

```bash
docker run -p 9090:8080 \
  -e SWAGGER_JSON=/spec/openapi.yaml \
  -v $(pwd)/mcp-server:/spec \
  swaggerapi/swagger-ui
```

Then open `http://localhost:9090`.

**Option 4 — Validate the spec locally**

```bash
cd mcp-server && npm run validate:api
```

### Endpoint Summary

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
| POST | `/api/chat/completions` | None | OpenAI-compatible streaming chat |
| POST | `/api/transcribe` | Bearer | Transcribe audio via Whisper |
| GET | `/api/docs` | None | Swagger UI (non-production) |

## MCP

- POST /mcp -- JSON-RPC for tools
  - queryRASS -- engine /ask
  - addDocumentToRASS -- embedding /upload (reads file from shared volume uploads/)

## Env/Config

- JWT_SECRET, OPENAI_API_KEY (for optional Whisper /api/transcribe)
- DATABASE_URL for Prisma/Postgres; migrations run on boot

---

## Core Features

- **MCP Tool Invocation:** Provides a central `/mcp` endpoint that correctly parses official JSON-RPC 2.0 messages from MCP clients.
- **Service Gateway:** Intelligently routes tool calls to the appropriate backend microservice:
  - `queryRASS` calls are proxied to the `rass-engine-service`.
  - `addDocumentToRASS` calls are proxied to the `embedding-service`.
- **File Handling Proxy:** For the `addDocumentToRASS` tool, it reads a file from a shared volume and correctly streams it as `multipart/form-data` to the embedding service.
- **Containerized & Networked:** Runs as a containerized service and communicates with other backend services over the shared Docker network.
- **OpenAPI Documentation:** Full API spec in `openapi.yaml` with Swagger UI at `/api/docs` (non-production).
- **Schema-driven Validation:** All request payloads are validated with Zod schemas before being processed.

---

## How it Works

- The MCP server exposes a single `/mcp` endpoint for all tool calls.
- It receives JSON-RPC 2.0 requests from clients (e.g., AI agents, test clients).
- Each tool call is routed to the appropriate backend service:
  - `addDocumentToRASS` -- embedding-service (for document upload and indexing)
  - `queryRASS` -- rass-engine-service (for querying and answer generation)
- The server handles file streaming, error handling, and response formatting.

---

## Related Docs

- [System Architecture & Workflows](../docs/PLANNER_AND_DIAGRAMS.md)
- [embedding-service/README.md](../embedding-service/README.md)
- [rass-engine-service/README.md](../rass-engine-service/README.md)
- [OpenAPI Spec](./openapi.yaml)
