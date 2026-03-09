# RASS Modernization Roadmap

This document describes the phased roadmap for transforming the Enhanced RASS (Retrieval-Augmented Semantic Search) system into an interview-quality, enterprise-grade knowledge discovery platform.

## Quick Start: Creating GitHub Issues

All phase issues are defined as JSON files in `.github/issues/`. To open them as GitHub issues:

```bash
# Install dependencies
pip install requests

# Create all issues (Phases B–G)
python3 scripts/create_github_issues.py \
    --token <YOUR_GITHUB_TOKEN> \
    --repo Taleef7/enhanced-rass

# Create issues for a specific phase only
python3 scripts/create_github_issues.py \
    --token <YOUR_GITHUB_TOKEN> \
    --repo Taleef7/enhanced-rass \
    --phase B

# Preview what would be created (no API calls that write data)
python3 scripts/create_github_issues.py \
    --token <YOUR_GITHUB_TOKEN> \
    --repo Taleef7/enhanced-rass \
    --dry-run
```

**Token requirements:** Create a GitHub Personal Access Token at https://github.com/settings/tokens with the `repo` scope.

---

## Phase Overview

| Phase | Name | Description | Issues |
|-------|------|-------------|--------|
| **B** | Core Product Transformation | Async ingestion, ETL provenance, document registry, BYO KB | 5 |
| **C** | Retrieval Excellence | Modular pipeline, reranking, HyDE, citations, evaluation | 5 |
| **D** | Enterprise Readiness | Multi-tenant workspaces, RBAC, data retention, SSO, audit | 5 |
| **E** | Observability & Proof | Distributed tracing, metrics, benchmarks, structured logging, eval discipline | 5 |
| **F** | Showcase Polish | Demo UX, OpenAPI docs, one-click demo, developer docs, value narrative | 5 |
| **G** | Stretch Goals | Adaptive retrieval, local models, multi-modal, knowledge graph, collaboration | 5 |

**Total: 30 issues across 6 milestones**

---

## Phase B — Core Product Transformation

**Goal:** Transform the synchronous, monolithic ingestion pipeline into a robust, observable, async ETL system.

### Issues
1. **Async document ingestion with job queue** — BullMQ-backed async processing; no more HTTP timeouts on large uploads
2. **ETL provenance tracking** — Record chunking strategy, embedding model, stage timings, and file hashes for every document
3. **Document registry** — Centralised Postgres table tracking document lifecycle (QUEUED → PROCESSING → READY → DELETED)
4. **Configurable chunking strategies** — Fixed-size, recursive-character, and sentence-window chunkers selectable via `config.yml`
5. **BYO Knowledge Base foundation** — Per-user/per-team knowledge bases with dedicated OpenSearch indices

### Key Deliverables
- `embedding-service/src/queue/ingestionQueue.js` — BullMQ queue definition
- `embedding-service/src/workers/ingestionWorker.js` — Async ingestion worker
- Prisma models: `Document`, `DocumentProvenance`, `KnowledgeBase`, `KBMember`
- API: `GET /ingest/status/:jobId`, `GET /api/documents`, `DELETE /api/documents/:id`

---

## Phase C — Retrieval Excellence

**Goal:** Achieve measurably state-of-the-art retrieval quality through a modular pipeline, reranking, and systematic evaluation.

### Issues
1. **Modular retrieval pipeline** — Pluggable `Stage` architecture replacing the monolithic retrieval function
2. **Cross-encoder reranking** — Cohere Rerank or local cross-encoder for improved precision@k
3. **HyDE query expansion** — Hypothetical Document Embeddings to improve recall for short queries
4. **Structured citations** — Typed citation objects with grounding verification and deep links
5. **Automated evaluation harness** — Curated test set, TruLens metrics, CI regression detection

### Key Deliverables
- `rass-engine-service/src/retrieval/Pipeline.js` and stage implementations
- `rass-engine-service/src/retrieval/reranking/` — Provider abstraction for Cohere and local models
- `evaluation/datasets/test_set.json` — ≥ 20 labeled queries
- `evaluation/run_eval.py` and `evaluation/compare_runs.py`
- GitHub Actions workflow: weekly evaluation with regression gates

---

## Phase D — Enterprise Readiness

**Goal:** Make RASS safe and compliant for multi-team, regulated-industry deployments.

### Issues
1. **Multi-tenant workspaces** — Organization → Workspace → User hierarchy with per-workspace OpenSearch indices
2. **Role-based access control** — VIEWER/EDITOR/ADMIN roles with resource-level permission enforcement
3. **Data retention and purge** — Configurable retention policies, GDPR right-to-erasure endpoint
4. **SSO and API key authentication** — OIDC/OAuth 2.0 login, machine-to-machine API keys, refresh tokens
5. **Enterprise audit logging** — Append-only audit trail for all authentication and data events

### Key Deliverables
- Prisma models: `Organization`, `Workspace`, `WorkspaceMember`, `ApiKey`, `AuditLog`
- `mcp-server/src/permissions.js` — Permission constants and `requirePermission` middleware
- `mcp-server/src/services/PurgeService.js` — Complete data purge (OpenSearch + Redis + Postgres)
- `mcp-server/src/services/AuditService.js` — Structured audit event writer
- Passport.js OIDC integration

---

## Phase E — Observability and Proof

**Goal:** Make every aspect of RASS performance and quality visible, measurable, and provable.

### Issues
1. **Distributed tracing** — OpenTelemetry across all services with Jaeger UI and custom spans per pipeline stage
2. **Metrics dashboard** — Prometheus metrics + pre-built Grafana dashboards for throughput, latency, and queue depth
3. **Performance benchmarking** — k6 load tests with documented baselines and regression thresholds
4. **Structured logging** — Pino JSON logging with correlation IDs, log redaction, and Loki aggregation
5. **Evaluation discipline** — Baseline contract, CI regression gates, quality trend dashboard

### Key Deliverables
- `src/otel.js` in each service — OpenTelemetry SDK bootstrap
- `monitoring/` — Prometheus config, Grafana dashboards, Loki/Promtail config
- `benchmarks/` — k6 load test scripts and baseline results
- `evaluation/BASELINE.json` — Committed quality baseline with regression thresholds
- Docker Compose additions: Jaeger, Prometheus, Grafana, Loki

---

## Phase F — Showcase Polish

**Goal:** Create an impressive, demo-ready system that communicates its value immediately to technical evaluators and enterprise buyers.

### Issues
1. **Demo UX redesign** — Knowledge graph visualization, source attribution timeline, \"RASS is thinking\" panel, demo mode
2. **OpenAPI documentation** — OpenAPI 3.1 spec, Swagger UI, generated TypeScript client
3. **One-click demo setup** — `bash scripts/demo.sh` → working RASS with seeded data in < 5 minutes
4. **Developer and architecture docs** — ADRs, enhanced README, contributing guide, cloud deployment guides
5. **Showcase value narrative** — Value proposition, case study, performance summary, blog post draft

### Key Deliverables
- `docs/api/openapi.yaml` — Complete OpenAPI 3.1 specification
- `demo/` — Demo docker-compose override, seed data, and seed script
- `docs/adr/` — Six Architecture Decision Records
- `CONTRIBUTING.md` — Developer onboarding guide
- Guided tour implementation with `react-joyride`

---

## Phase G — Stretch Goals

**Goal:** Standout features that demonstrate frontier engineering and differentiate RASS from tutorial-grade RAG systems.

### Issues
1. **Adaptive retrieval** — User feedback learning (thumbs up/down + clicks) with feedback-boosted retrieval and A/B testing
2. **Local model support** — Ollama integration for fully offline, zero-cost, privacy-preserving deployments
3. **Multi-modal understanding** — OCR for scanned PDFs, table extraction, vision LLM image descriptions
4. **Knowledge graph extraction** — LLM-powered entity/relation extraction enabling multi-hop retrieval and interactive graph browsing
5. **Real-time collaborative annotation** — WebSocket-powered shared annotations that directly influence retrieval quality

### Key Deliverables
- `rass-engine-service/src/retrieval/FeedbackBoostStage.js` — Personalized retrieval
- `embedding-service/src/providers/OllamaEmbeddingProvider.js` — Local model integration
- Prisma models: `Entity`, `Relation`, `Annotation`, `RetrievalFeedback`
- `docker-compose.yml` additions: Ollama service
- Interactive knowledge graph in the frontend with `react-force-graph-2d`

---

## Architecture Evolution

```
Phase A (Current)          Phase B-C                   Phase D-G
─────────────────          ────────────────────         ─────────────────────────
Single-user RAG            Async ETL + Modular          Enterprise Platform
                           Retrieval Pipeline
                                                        Orgs → Workspaces → KBs
Upload → Embed →           Upload → Queue →             Multi-tenant isolation
Index (sync)               Worker → ETL Provenance      RBAC + SSO + Audit

Hybrid search →            Pipeline stages:             Adaptive retrieval
LLM generation             Embed → Search →             Knowledge graph
                           Rerank → Generate             Multi-modal ingestion
                                                        Local model support
No metrics                 OpenTelemetry                Full observability:
Console.log only           Prometheus/Grafana           Traces + Metrics + Logs
                           Structured logging           + Evaluation baselines
```

---

## Issue Files

| File | Phase | Issues |
|------|-------|--------|
| `docs/issues/phase-b.json` | B — Core Product Transformation | 5 |
| `docs/issues/phase-c.json` | C — Retrieval Excellence | 5 |
| `docs/issues/phase-d.json` | D — Enterprise Readiness | 5 |
| `docs/issues/phase-e.json` | E — Observability & Proof | 5 |
| `docs/issues/phase-f.json` | F — Showcase Polish | 5 |
| `docs/issues/phase-g.json` | G — Stretch Goals | 5 |

Each JSON file follows the schema:
```json
{
  "milestone": "Phase X — Name",
  "milestone_description": "...",
  "issues": [
    {
      "title": "[Phase X] Issue title",
      "labels": ["enhancement", "phase-x", "category"],
      "body": "## Problem\n...\n## Implementation Plan\n...\n## Acceptance Criteria\n..."
    }
  ]
}
```
