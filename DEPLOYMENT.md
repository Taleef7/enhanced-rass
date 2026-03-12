# RASS Project Deployment Guide

This document provides instructions for deploying and managing the RASS (Retrieval Augmented Semantic Search) application stack using Docker Compose and the provided management scripts.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Configuration](#configuration)
3. [Quick Start (Development)](#quick-start-development)
4. [One-Click Demo](#one-click-demo)
5. [Running the Application](#running-the-application)
6. [Accessing Services](#accessing-services)
7. [Database Migrations](#database-migrations)
8. [Production Deployment](#production-deployment)
9. [Health Checks](#health-checks)
10. [Updating the Application](#updating-the-application)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker** ≥ 24.x
- **Docker Compose** v2+ (`docker compose` not `docker-compose`)
- **Node.js** ≥ 18.x (for local development only)
- **Git** ≥ 2.35

---

## Configuration

The application uses per-service `config.yml` files validated at startup, plus a root `.env` file for secrets.

### 1. Create the root `.env` file

```bash
cp .env.example .env
```

Edit `.env` and provide:

```env
# Required: LLM Provider (choose one)
OPENAI_API_KEY=sk-...          # For OpenAI
# GEMINI_API_KEY=...           # For Google Gemini (alternative)

# Required: Auth secrets (generate with: openssl rand -base64 48)
JWT_SECRET=<random 64+ char string>
REFRESH_TOKEN_SECRET=<different random 64+ char string>

# Optional: Override service URLs for local dev
# RASS_ENGINE_URL=http://localhost:3001
# EMBEDDING_SERVICE_URL=http://localhost:3002
```

### 2. Review `config.yml` in each service

Each service has a `config.yml` with port, database connection, and feature settings. The defaults work out-of-the-box with Docker Compose.

**Key settings:**

| Service | File | Key Setting |
|---------|------|-------------|
| mcp-server | `mcp-server/config.yml` | `JWT_SECRET`, database URL |
| rass-engine | `rass-engine-service/config.yml` | `LLM_PROVIDER`, model name |
| embedding-service | `embedding-service/config.yml` | `EMBED_WORKER_CONCURRENCY` |

---

## Quick Start (Development)

```bash
# 1. Clone
git clone https://github.com/Taleef7/enhanced-rass.git
cd enhanced-rass

# 2. Configure
cp .env.example .env
# Edit .env with your API keys

# 3. Start all services
docker compose up -d

# 4. Apply database migrations (first time only)
cd mcp-server && npx prisma migrate deploy && cd ..

# 5. Open the app
open http://localhost:3000
```

---

## One-Click Demo

For a pre-seeded demo with sample documents and guided tour:

```bash
./scripts/demo.sh
```

This starts the full stack using `demo/docker-compose.demo.yml`, seeds sample documents, and opens the app on `http://localhost:3000`.

See [demo/README.md](demo/README.md) for details.

---

## Running the Application

Management scripts are provided in the `scripts/` directory.

### Start the Application

```bash
./scripts/start.sh
```

This builds changed Docker images and starts all services in detached mode.

### Stop the Application

```bash
./scripts/stop.sh
```

Gracefully stops and removes containers and the Docker network.

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f mcp-server
docker compose logs -f rass-engine-service
docker compose logs -f embedding-service
```

---

## Accessing Services

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | `http://localhost:3000` | React web application |
| **MCP Server (API)** | `http://localhost:8080` | REST API gateway |
| **API Documentation** | `http://localhost:8080/api/docs` | Swagger UI (OpenAPI 3.1) |
| **RASS Engine** | `http://localhost:3001` | Internal: retrieval + generation |
| **Embedding Service** | `http://localhost:3002` | Internal: document ingestion |
| **OpenSearch** | `http://localhost:9200` | Internal: vector + keyword search |
| **Prometheus Metrics** | `http://localhost:8080/metrics` | Prometheus scrape endpoint |
| **Queue Dashboard** | `http://localhost:3002/admin/queues` | Bull Board (BullMQ monitor) |

---

## Database Migrations

RASS uses **Prisma** for schema migrations. Run on first deploy and after each update:

```bash
cd mcp-server
npx prisma migrate deploy    # Apply pending migrations (production)
npx prisma migrate dev       # Apply + generate new migration (development)
npx prisma studio            # Visual database browser
```

---

## Production Deployment

### Recommended Architecture

```
Internet → Nginx/Traefik (TLS) → Frontend (port 3000)
                               → MCP Server (port 8080)

Internal network only:
  MCP Server → RASS Engine (port 3001)
  MCP Server → Embedding Service (port 3002)
  All services → OpenSearch (port 9200)
  All services → Redis (port 6379)
  MCP Server → PostgreSQL (port 5432)
```

### TLS / HTTPS

Set up **Nginx** or **Traefik** as a reverse proxy with Let's Encrypt certificates. Do **not** expose internal service ports (3001, 3002, 9200, 6379, 5432) publicly.

### Environment Variables for Production

Add to your production `.env`:

```env
NODE_ENV=production
COOKIE_SECURE=true              # Enforce HTTPS for refresh token cookie
OPENSEARCH_HOST=<private IP>    # Keep OpenSearch on private network
```

### Resource Requirements

| Component | Min RAM | Recommended |
|-----------|---------|-------------|
| MCP Server | 256 MB | 512 MB |
| RASS Engine | 512 MB | 1 GB |
| Embedding Service + Worker | 512 MB | 1 GB |
| OpenSearch | 2 GB | 4 GB |
| PostgreSQL | 256 MB | 512 MB |
| Redis | 256 MB | 512 MB |
| **Total** | **~4 GB** | **~8 GB** |

---

## Health Checks

```bash
# Check all services
curl http://localhost:8080/api/health | jq .

# Expected response when healthy:
# {
#   "status": "ok",
#   "timestamp": "2025-01-15T10:00:00.000Z",
#   "services": {
#     "postgres": { "status": "ok" },
#     "opensearch": { "status": "ok", "clusterStatus": "green" },
#     "embeddingService": { "status": "ok" },
#     "redis": { "status": "ok" },
#     "rassEngine": { "status": "ok" }
#   }
# }
```

The health endpoint returns **HTTP 200** when all services are healthy and **HTTP 503** when degraded.

---

## Updating the Application

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild changed images
docker compose build

# 3. Apply migrations (if schema changed)
cd mcp-server && npx prisma migrate deploy && cd ..

# 4. Restart services with zero-downtime rolling update
docker compose up -d --no-deps mcp-server
docker compose up -d --no-deps rass-engine-service
docker compose up -d --no-deps embedding-service
```

---

## Troubleshooting

### OpenSearch fails to start

```bash
# On Linux hosts, increase vm.max_map_count
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### "Cannot connect to database"

```bash
# Verify Postgres is running
docker compose ps postgres

# Check mcp-server logs for migration errors
docker compose logs mcp-server | grep -i error
```

### Documents stuck in "Processing"

```bash
# Check the BullMQ worker logs
docker compose logs embedding-service | grep -i error

# Check Redis is up
docker compose exec redis redis-cli ping
```

### Port conflicts

Edit `config.yml` in the relevant service to change ports, then update `docker-compose.yml` port mappings accordingly.


---

## Cloud Deployment Guides

### AWS ECS (Elastic Container Service)

#### 1. Push images to ECR

```bash
# Authenticate to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push each service
for svc in mcp-server rass-engine-service embedding-service frontend; do
  docker build -t rass-$svc ./$svc
  docker tag rass-$svc:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/rass-$svc:latest
  docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/rass-$svc:latest
done
```

#### 2. Infrastructure

Use the following managed AWS services instead of Docker containers:

| Component | AWS Service |
|-----------|------------|
| OpenSearch | Amazon OpenSearch Service |
| Redis | Amazon ElastiCache (Redis OSS) |
| PostgreSQL | Amazon RDS PostgreSQL |
| Container orchestration | ECS Fargate |
| Secrets | AWS Secrets Manager |
| TLS termination | Application Load Balancer (ALB) |

#### 3. Task Definition (mcp-server example)

```json
{
  "family": "rass-mcp-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [{
    "name": "mcp-server",
    "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/rass-mcp-server:latest",
    "portMappings": [{"containerPort": 8080}],
    "secrets": [
      {"name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:..."},
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:..."}
    ],
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "OPENSEARCH_HOST", "value": "<opensearch-endpoint>"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {"awslogs-group": "/ecs/rass", "awslogs-region": "us-east-1"}
    }
  }]
}
```

#### 4. Apply migrations

```bash
# Run as a one-off ECS task after each deployment
aws ecs run-task \
  --cluster rass \
  --task-definition rass-migrate \
  --overrides '{"containerOverrides":[{"name":"mcp-server","command":["npx","prisma","migrate","deploy"]}]}'
```

---

### GCP Cloud Run

#### 1. Push images to Artifact Registry

```bash
# Configure docker for GCP
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build and push
for svc in mcp-server rass-engine-service embedding-service frontend; do
  docker build -t us-central1-docker.pkg.dev/<project-id>/rass/rass-$svc:latest ./$svc
  docker push us-central1-docker.pkg.dev/<project-id>/rass/rass-$svc:latest
done
```

#### 2. Deploy mcp-server to Cloud Run

```bash
gcloud run deploy rass-mcp-server \
  --image us-central1-docker.pkg.dev/<project-id>/rass/rass-mcp-server:latest \
  --region us-central1 \
  --platform managed \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production \
  --set-secrets JWT_SECRET=rass-jwt-secret:latest \
  --set-secrets DATABASE_URL=rass-db-url:latest \
  --allow-unauthenticated
```

#### 3. Managed infrastructure

| Component | GCP Service |
|-----------|------------|
| OpenSearch | Elastic Cloud on GCP (or self-managed GCE) |
| Redis | Memorystore for Redis |
| PostgreSQL | Cloud SQL for PostgreSQL |
| Container orchestration | Cloud Run |
| Secrets | Secret Manager |
| TLS termination | Cloud Run (automatic) / Cloud Load Balancing |

#### 4. Cloud Run limitations for RASS

- **SSE (streaming)**: Cloud Run supports SSE. Set `--timeout 3600` for long-running streams.
- **File uploads**: Cloud Run is stateless. Configure a Cloud Storage bucket for uploaded files instead of local filesystem.
- **BullMQ workers**: Deploy the embedding-service as a separate Cloud Run service with `--min-instances 1` to keep the worker alive.

---

### Production Hardening Checklist

- [ ] All services behind a TLS-terminating reverse proxy (Nginx/ALB/Cloud Load Balancer)
- [ ] Internal service ports (3001, 3002, 9200, 6379, 5432) not exposed publicly
- [ ] Secrets in a secrets manager (AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault)
- [ ] JWT_SECRET and REFRESH_TOKEN_SECRET ≥ 64 random characters
- [ ] Database connection pool size tuned for expected concurrency
- [ ] OpenSearch heap = 50% of available RAM (max 32 GB)
- [ ] Redis `maxmemory-policy allkeys-lru` configured
- [ ] Health check endpoint monitored (uptime check every 30s)
- [ ] Log aggregation configured (CloudWatch / GCP Logging / Loki)
- [ ] Database backups scheduled (daily snapshots, 30-day retention)
- [ ] Rate limiting verified (100 req/15 min default)
- [ ] CORS origins explicitly configured (no `*` in production)
