# RASS System Architecture Overview

## System Components

CoRAG is a distributed system consisting of four microservices that communicate over a private Docker network:

### 1. MCP Server (Port 8080)
The API gateway and central coordinator. Responsibilities:
- User authentication (JWT + refresh tokens)
- Document upload handling and metadata storage (PostgreSQL via Prisma)
- Knowledge base and workspace management
- Audit logging for compliance
- API key management for M2M integrations
- Proxying streaming requests to the RASS Engine

### 2. RASS Engine Service (Port 8000)
Handles the core RAG pipeline:
- Query understanding and HyDE expansion
- Hybrid retrieval (vector KNN + BM25 via OpenSearch)
- Cross-encoder reranking
- SSE streaming to the client
- Supports OpenAI and Google Gemini providers

### 3. Embedding Service (Port 8001)
Async document processing via BullMQ job queue:
- File parsing (PDF via pdf-parse, DOCX via mammoth, TXT/MD)
- Parent-child chunking (configurable: fixed_size, recursive_character, sentence_window)
- Embedding generation (text-embedding-004 or ada-002)
- OpenSearch bulk indexing
- Redis parent chunk storage

### 4. Frontend (Port 3000)
React SPA with Material UI:
- Multi-session chat interface
- Real-time SSE message streaming with typing cursor
- Document library with upload and status tracking
- Knowledge base management with interactive graph visualization
- Guided onboarding tour

## Data Flow

```
User Upload:
Browser → MCP Server → BullMQ (Redis) → Embedding Worker
                    ↓                          ↓
                PostgreSQL             OpenSearch + Redis

User Query:
Browser → MCP Server → RASS Engine → OpenSearch (KNN + BM25)
                                   → Redis (parent chunks)
                                   → LLM (OpenAI / Gemini)
                                   → SSE stream → Browser
```

## Infrastructure Dependencies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Vector + keyword search | OpenSearch 2.11 | Hybrid retrieval |
| Job queue + cache | Redis 7 | Async ingestion + parent chunks |
| Relational database | PostgreSQL 15 | User/document/audit metadata |
| LLM provider | OpenAI / Google | Answer generation |
| Embedding model | text-embedding-004 | Vector generation |

## Security Model

- **Authentication**: Short-lived JWT (15 min) + HTTP-only refresh cookie (7 days)
- **Authorization**: RBAC on knowledge bases (Owner/Editor/Viewer)
- **Isolation intent**: KB and workspace flows provision dedicated OpenSearch indices, although the active retrieval stage still uses the default configured search index
- **Audit**: All sensitive actions logged to PostgreSQL AuditLog table
- **Rate limiting**: 100 req/15 min general, 10 req/15 min for deletions

## API Documentation

The complete API is documented in OpenAPI 3.1 format at `/api/docs` (Swagger UI).

Key endpoints:
- `POST /api/auth/login` — Authenticate and get JWT
- `POST /api/embed-upload` — Upload document for async ingestion
- `POST /api/stream-ask` — Stream a question answer (SSE)
- `GET /api/knowledge-bases/:kbId/graph` — Knowledge graph visualization data
- `GET /api/health` — Aggregated health check for all services
