# Contributing to CoRAG

## Local setup

```bash
git clone https://github.com/Taleef7/enhanced-rass.git
cd enhanced-rass
cp .env.example .env
docker network create shared_rass_network
./scripts/start.sh
```

If you need the UI:

```bash
cd frontend
npm install
npm start
```

Important: the root compose stack does not currently start the normal frontend.

## Default ports

| Service | Port |
| --- | --- |
| frontend dev server | 3000 |
| mcp-server | 8080 |
| rass-engine-service | 8000 |
| embedding-service | 8001 |
| OpenSearch | 9200 |
| Redis | 6379 |
| Postgres | 5432 |

## Repository layout

- `frontend/`: React app
- `mcp-server/`: gateway, auth, Prisma, control plane APIs
- `rass-engine-service/`: retrieval and generation
- `embedding-service/`: ingestion worker and indexing
- `docs/`: architecture and user docs
- `demo/`: demo-oriented assets and compose file
- `scripts/`: helper scripts

## Working conventions

- Frontend uses ES modules and React function components.
- Backend services use CommonJS.
- Validate request bodies with Zod.
- Treat runtime code as the source of truth when docs drift.
- Update docs when changing ports, auth behavior, route contracts, or runtime topology.

## Testing

```bash
cd mcp-server && npm test
cd rass-engine-service && npm test
cd embedding-service && npm test
```

Also validate the API spec when changing gateway routes:

```bash
cd mcp-server && npm run validate:api
```

## Pull requests

- Use focused branches.
- Prefer conventional commits.
- Update docs alongside code changes that affect public behavior.
- Do not rely on the older phase writeups as the primary implementation description.
