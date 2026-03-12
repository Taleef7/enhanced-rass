# Embedding Service

`embedding-service` is the async ingestion backend.

## What it does

- Accepts file uploads
- Writes temp files to disk
- Enqueues BullMQ ingestion jobs
- Runs parse -> chunk -> embed -> index asynchronously
- Stores parent chunks in Redis
- Stores child chunks in OpenSearch
- Calls back into `mcp-server` to update document status and provenance

## Endpoints

- `POST /upload`
- `GET /ingest/status/:jobId`
- `POST /get-documents`
- `GET /health`
- `GET /metrics`
- `GET /admin/queues` in non-production

## Upload contract

`POST /upload` accepts multipart form data and returns `202 Accepted`.

Important form fields:

- `files`
- `userId`
- `documentId` for single-file uploads proxied by `mcp-server`
- optional `kbId`
- optional `targetIndex`
- optional `chunkingStrategy`

## Worker flow

1. Parse document text
2. Optionally run OCR fallback
3. Build parent and child chunks
4. Embed child chunks
5. Index child chunks in OpenSearch
6. Store parent chunks in Redis
7. Report status/provenance back to `mcp-server`

## Config

Loaded from the repo-root `config.yml`:

- `EMBEDDING_SERVICE_PORT`
- `EMBEDDING_PROVIDER`
- `OPENAI_EMBED_MODEL_NAME`
- `GEMINI_EMBED_MODEL_NAME`
- `EMBED_DIM`
- `CHUNKING_STRATEGY`
- `PARENT_CHUNK_SIZE`
- `PARENT_CHUNK_OVERLAP`
- `CHILD_CHUNK_SIZE`
- `CHILD_CHUNK_OVERLAP`
- `VISION_ENABLED`

## Notes

- The service ensures the default OpenSearch index exists on boot.
- Multi-tenant control-plane code can supply a `targetIndex` for KB/workspace ingestion.
- Document deletion elsewhere in the stack is not a full purge of Redis parent chunks.
