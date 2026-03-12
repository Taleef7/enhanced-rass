# RASS Deployment Guide

This document describes the deployment shape that exists in the repository today.

## Deployment Modes

RASS currently has two practical ways to run:

### 1. Root backend stack

Use the root `docker-compose.yml` when you want the backend platform and observability services:

- `mcp-server`
- `rass-engine-service`
- `embedding-service`
- OpenSearch
- Redis
- Postgres
- Jaeger
- Prometheus
- Grafana
- Loki
- Promtail
- Ollama

Important: this stack does not run the standard React frontend.

### 2. Local frontend development

Run the frontend separately:

```bash
cd frontend
npm install
npm start
```

The frontend targets `http://localhost:8080/api`.

### 3. Demo compose

The repo also contains `demo/docker-compose.demo.yml`. It is intended to run a demo stack, but it should not be treated as the canonical development path. The root stack plus local frontend is the current reliable baseline.

## Prerequisites

- Docker with Compose support
- Node.js 18+ for local frontend work
- Git
- One-time Docker network creation:

```bash
docker network create shared_rass_network
```

## Configuration Model

### Shared non-secret config

All backend services read the repo-root `config.yml`.

Notable values:

- `MCP_SERVER_PORT: 8080`
- `RASS_ENGINE_PORT: 8000`
- `EMBEDDING_SERVICE_PORT: 8001`
- `OPENSEARCH_INDEX_NAME: knowledge_base`
- `EMBEDDING_PROVIDER`
- `LLM_PROVIDER`
- `CHUNKING_STRATEGY`
- `EMBED_DIM`
- `HYDE_ENABLED`
- `RERANK_PROVIDER`
- `VISION_ENABLED`

### Secrets

Put secrets in the root `.env`:

```env
OPENAI_API_KEY=...
GEMINI_API_KEY=...
JWT_SECRET=...
REFRESH_TOKEN_SECRET=...
DATABASE_URL=postgresql://rass_user:rass_password@db:5432/rass_db
```

Optional local overrides for the gateway:

```env
RASS_ENGINE_URL=http://localhost:8000
EMBEDDING_SERVICE_URL=http://localhost:8001
```

## Start and Stop

### Start the root backend stack

```bash
./scripts/start.sh
```

That script runs:

```bash
docker-compose up -d --build
```

On startup, `mcp-server` runs:

```bash
npx prisma migrate deploy && node index.js
```

### Stop the root backend stack

```bash
./scripts/stop.sh
```

## Service Endpoints

### Root backend stack

| Service | URL | Purpose |
| --- | --- | --- |
| `mcp-server` | `http://localhost:8080` | Main API gateway |
| Swagger UI | `http://localhost:8080/api/docs` | OpenAPI explorer in non-production |
| Health | `http://localhost:8080/api/health` | Aggregated health checks |
| `rass-engine-service` | `http://localhost:8000` | Retrieval and generation |
| `embedding-service` | `http://localhost:8001` | Ingestion and queue endpoints |
| Bull Board | `http://localhost:8001/admin/queues` | Queue dashboard in non-production |
| OpenSearch | `http://localhost:9200` | Search cluster |
| Postgres | `localhost:5432` | Relational store |
| Redis | `localhost:6379` | Queue and parent docstore |
| Jaeger | `http://localhost:16686` | Trace UI |
| Prometheus | `http://localhost:9090` | Metrics |
| Grafana | `http://localhost:3001` | Dashboards |
| Loki | `http://localhost:3100` | Log API |
| Ollama | `http://localhost:11434` | Local model server |

### Frontend

When run locally:

- `http://localhost:3000`

## Health and Operations

### Aggregated health

```bash
curl http://localhost:8080/api/health
```

The response is built by `mcp-server` and checks:

- Postgres through Prisma
- OpenSearch cluster health
- `embedding-service` health
- `rass-engine-service` health

### Logs

```bash
docker compose logs -f
docker compose logs -f mcp-server
docker compose logs -f rass-engine-service
docker compose logs -f embedding-service
```

### Migrations

For manual Prisma operations:

```bash
cd mcp-server
npx prisma migrate deploy
npx prisma studio
```

## Production Topology

The current service split is:

```text
Internet -> TLS reverse proxy -> frontend and/or mcp-server

Private network only:
  mcp-server -> rass-engine-service:8000
  mcp-server -> embedding-service:8001
  services -> OpenSearch:9200
  services -> Redis:6379
  mcp-server -> Postgres:5432
```

Production guidance:

- Do not expose OpenSearch, Redis, or Postgres publicly.
- Treat `rass-engine-service` and `embedding-service` as private backend services.
- Serve the frontend separately or behind the same reverse proxy as `mcp-server`.
- Set `NODE_ENV=production` and ensure HTTPS so refresh cookies can be `Secure`.

## Resource Expectations

The compose file is tuned for development, not strict production sizing. A practical local baseline is:

| Component | Suggested RAM |
| --- | --- |
| `mcp-server` | 512 MB |
| `rass-engine-service` | 512 MB to 1 GB |
| `embedding-service` | 512 MB to 1 GB |
| OpenSearch | 2 GB+ |
| Postgres | 512 MB |
| Redis | 256 MB |

## Known Deployment Caveats

- The root stack and the docs used to assume ports `3001` and `3002`. The current compose file exposes `8000` and `8001`.
- The root stack does not include the standard frontend.
- `promtail` mounts Docker host paths that may require environment-specific adjustment outside Docker Desktop or WSL-style setups.
- The demo compose should be treated as separate and potentially more fragile than the root stack.
- Multi-tenant OpenSearch indices are provisioned by the control plane, but the active retrieval stage still searches the default configured index.

## Troubleshooting

### OpenSearch fails to start

```bash
sudo sysctl -w vm.max_map_count=262144
```

### Uploads stay queued or processing

```bash
docker compose logs -f embedding-service
docker compose exec redis redis-cli ping
```

### API auth appears broken after changing secrets

JWT and refresh-token secrets invalidate old sessions when changed. Log in again after rotating:

- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`

### Vector dimension errors

Ensure `EMBED_DIM` matches the active embedding model:

- Gemini `text-embedding-004` -> `768`
- OpenAI `text-embedding-3-large` -> `3072`

If you change `EMBED_DIM`, recreate the target OpenSearch index before re-ingesting documents.
