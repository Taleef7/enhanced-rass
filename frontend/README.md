# Frontend

React client for the current RASS UI.

## What it does

- Handles login, logout, and silent session restoration
- Renders the main chat interface
- Streams assistant responses from `POST /api/stream-ask`
- Uploads files through `mcp-server`
- Shows document status, provenance, and deletion UI

## Run in development

```bash
cd frontend
npm install
npm start
```

The app runs on `http://localhost:3000`.

## Backend target

The frontend talks to:

- `http://localhost:8080/api`

The root backend compose stack must be running separately.

## Auth model

The canonical auth flow is:

- JWT stored in React memory, not localStorage
- HTTP-only refresh-token cookie set by `mcp-server`
- Silent refresh on app load via `POST /api/auth/refresh`

Some components still contain legacy token assumptions. The source of truth is `src/context/AuthContext.js`.

## Main UI modules

- `src/context/AuthContext.js`: JWT state and silent refresh
- `src/context/ChatContext.js`: chat state and server sync
- `src/components/Chat.js`: streaming conversation surface
- `src/components/DocumentManager.js`: document listing, provenance, delete
- `src/components/UploadManager.js`: upload and ingestion polling
- `src/components/SharedChatView.js`: public shared-chat route component

## Current caveats

- The root compose stack does not start this frontend automatically.
- Shared-chat rendering code assumes message fields that do not match the current backend model.
- Some optional feature components still use legacy token lookup patterns.
