# RASS User Guide

This guide describes the user-facing behavior that is present in the current codebase.

For full setup, boot, and end-to-end local usage instructions, start with `docs/getting-started.md`.

## What RASS does

RASS lets you upload documents, wait for them to be indexed, and ask questions against the indexed content. Answers stream back live and include source citations.

## Getting Started

### 1. Create an account

Open the frontend and register a username and password. After login, the app keeps your session alive using:

- a short-lived JWT held in memory
- a refresh-token cookie managed by the backend

### 2. Upload a document

Upload from the chat input or the document-management UI.

Supported formats in the current ingestion pipeline include:

- `.pdf`
- `.txt`
- `.md`
- `.docx`
- common image formats when OCR is enabled

Current status values:

- `QUEUED`
- `PROCESSING`
- `READY`
- `FAILED`
- `DELETED`

### 3. Ask a question

Once documents are `READY`, ask a question in chat. RASS will:

1. retrieve relevant passages
2. stream an answer
3. emit citations at the end of the stream

For the complete local flow, including Docker, frontend startup, observability, demo mode, and Ollama setup, use `docs/getting-started.md`.

## Main Screens

### Chat

- create and switch chats
- stream assistant responses
- upload files through the paperclip action
- inspect retrieved context when available

### Document Manager

- list uploaded documents
- see document status
- open ETL provenance for ready documents
- delete documents

Deletion is a soft-delete plus best-effort search cleanup. It should not be interpreted as an immediate deep purge of every backing store.

## Knowledge Bases and Workspaces

The backend supports:

- knowledge bases
- organizations
- workspaces
- role-based access control

These platform features exist in the API and data model, but the chat UX is still primarily centered on the personal document/chat flow. Treat knowledge-base and workspace management as backend-first capabilities unless your local frontend build exposes the corresponding screens.

## Context and Citations

Streaming answers can include:

- retrieved context chunks before generation
- structured citations after generation

This is what powers the "What CoRAG is thinking" style transparency panel in the UI.

## API Keys

Programmatic clients can use API keys with:

```http
Authorization: ApiKey rass_...
```

Older docs that reference `X-Api-Key` are outdated.

## Session Behavior

- Access tokens are short-lived.
- Refresh is automatic while the refresh-token cookie is valid.
- If the refresh token expires, you must log in again.

## Current Caveats

- Shared-chat UI exists in the frontend, but the underlying backend route is not fully aligned with the current message schema.
- Knowledge graph functionality exists in two forms in the repo:
  - an older document-similarity graph concept
  - the newer entity/relation graph APIs
- Some advanced platform features are better exercised through the API than through the current default frontend flow.
