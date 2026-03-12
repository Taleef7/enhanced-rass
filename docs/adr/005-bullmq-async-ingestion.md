# ADR 005: Async Ingestion Queue with BullMQ + Redis

**Date:** 2025-01-15
**Status:** Accepted
**Author:** RASS Architecture Team

## Context

Document ingestion (Parse → Chunk → Embed → Index) is a multi-stage, compute-intensive process that can take 5–120 seconds depending on document size and embedding model latency. If performed synchronously in the HTTP request handler:
- The HTTP request times out for large documents
- A single slow document blocks other uploads
- There is no retry mechanism for transient failures (LLM rate limits, OpenSearch timeouts)

## Decision

Use **BullMQ** (Redis-backed job queue) to process ingestion asynchronously:

1. `POST /api/embed-upload` validates and saves the file, creates a `Document` record (status: `QUEUED`), enqueues a BullMQ job, and returns `202 Accepted` with `{ jobId, documentId }` immediately.
2. A dedicated BullMQ worker process (in the `embedding-service`) picks up the job and runs the full ingestion pipeline.
3. The client polls `GET /api/ingest/status/:jobId` (or uses WebSocket in future) for progress.

## Rationale

- **Non-blocking uploads**: HTTP handler returns in milliseconds regardless of document size.
- **Retries with backoff**: BullMQ automatically retries failed jobs with exponential backoff (configurable: 3 retries, 10s base delay).
- **Concurrency control**: Worker concurrency is configurable (`EMBED_WORKER_CONCURRENCY` in config.yml) to limit parallel embedding calls to the LLM.
- **Observability**: BullMQ stores job state (waiting/active/completed/failed) in Redis, queryable via `GET /api/ingest/status/:jobId`.
- **Redis already required**: Redis is already used for parent chunk storage, so no additional infrastructure is needed.

## Consequences

- **Positive**: Handles arbitrarily large documents without HTTP timeout.
- **Positive**: Automatic retry with backoff on transient failures.
- **Positive**: Natural rate limiting via worker concurrency setting.
- **Negative**: Redis is now a critical infrastructure dependency. Redis downtime stops ingestion.
- **Negative**: Job status must be polled or pushed (no native SSE for job progress in this version).
- **Mitigation**: Redis persistence (AOF) enabled to survive restarts. Bull Board dashboard (`/admin/queues`) for operational visibility.

## Job Lifecycle

```
POST /api/embed-upload
  → validate file
  → Prisma: Document { status: QUEUED }
  → BullMQ: enqueue { documentId, filePath, userId, kbId }
  → HTTP 202 { jobId, documentId }

BullMQ Worker:
  1. Parse (pdf-parse / mammoth / fs.readFile)
  2. Chunk (RecursiveCharacterTextSplitter with parent-child)
  3. Embed (Google text-embedding-004 or OpenAI ada-002)
  4. Index (OpenSearch bulk _index)
  5. Prisma: Document { status: READY, chunkCount }

Client:
  GET /api/ingest/status/:jobId → { status, progress, stage }
```

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Synchronous HTTP processing | Timeouts for large docs; blocking; no retry |
| PostgreSQL SKIP LOCKED queue | More complex; less observability than BullMQ |
| AWS SQS / RabbitMQ | External dependency; overengineered for self-hosted deployment |
| Worker threads in same process | No retry; single process failure kills all work |
