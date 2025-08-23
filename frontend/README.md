# Frontend (React)

Create React App-based UI for Enhanced RASS. Talks only to mcp-server on port 8080.

## Run (dev)

```bash
cd frontend
npm install
npm start
```

The CRA dev server proxies API calls to [http://localhost:8080](http://localhost:8080).

## Auth

- Register and login store a JWT in localStorage under `authToken`.
- All API calls read that token and send it as Bearer.

## Key screens

- Welcome screen (minimal): title/subtitle centered
- Sidebar: search, New Chat, per-chat menu (rename/delete)
- Chat: streaming responses with citations; upload via paperclip
- Documents: modal listing your aggregated uploads

## Troubleshooting

- If “Your Documents” fails to load, logout/login to refresh the token.
- For stream issues, ensure mcp-server → rass-engine-service is healthy.
