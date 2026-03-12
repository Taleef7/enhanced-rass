# Contributing to Enhanced RASS

Thank you for your interest in contributing to Enhanced RASS! This document describes our development workflow, code standards, and review process.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Project Structure](#project-structure)
4. [Branching Strategy](#branching-strategy)
5. [Development Workflow](#development-workflow)
6. [Code Standards](#code-standards)
7. [Testing](#testing)
8. [Pull Request Process](#pull-request-process)
9. [Issue Reporting](#issue-reporting)

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **Docker** and **Docker Compose** v2+
- **Git** ≥ 2.35

### Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/Taleef7/enhanced-rass.git
cd enhanced-rass

# 2. Copy environment template (edit with your API keys)
cp .env.example .env

# 3. Start all services in development mode
docker compose up -d

# 4. Apply database migrations
cd mcp-server && npx prisma migrate dev
```

The MCP server starts on `http://localhost:8080`, the frontend on `http://localhost:3000`.

---

## Development Environment

### Service Ports (defaults from `config.yml`)

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React development server |
| MCP Server | 8080 | API gateway / auth / documents |
| RASS Engine | 3001 | Retrieval + generation |
| Embedding Service | 3002 | Document ingestion + embedding |
| OpenSearch | 9200 | Vector + keyword search |
| Redis | 6379 | Queue + parent chunk cache |
| PostgreSQL | 5432 | Relational metadata |

### Environment Variables

Copy `.env.example` and fill in:

```
OPENAI_API_KEY=sk-...          # or GEMINI_API_KEY for Gemini provider
JWT_SECRET=<random 64 char>
REFRESH_TOKEN_SECRET=<random 64 char>
```

See each service's `config.yml` for full config reference.

---

## Project Structure

```
enhanced-rass/
├── frontend/              # React SPA (MUI, react-router-dom)
├── mcp-server/            # Express API gateway (auth, documents, KBs)
│   ├── src/routes/        # Route handlers
│   ├── src/services/      # Business logic (audit, RBAC)
│   ├── prisma/            # Prisma schema + migrations
│   └── openapi.yaml       # OpenAPI 3.1 spec
├── rass-engine-service/   # Retrieval + LLM generation
│   ├── src/retrieval/     # Pipeline stages
│   ├── src/generation/    # LLM streaming
│   └── src/routes/        # /stream-ask, /ask
├── embedding-service/     # BullMQ worker + ETL pipeline
│   ├── src/workers/       # Ingestion worker
│   └── src/clients/       # OpenSearch, Redis clients
├── docs/
│   ├── adr/               # Architecture Decision Records
│   ├── api/               # OpenAPI spec + streaming docs
│   └── MODERNIZATION_ROADMAP.md
├── demo/                  # One-click demo setup
│   ├── docker-compose.demo.yml
│   └── seed_data/
└── scripts/               # CI + operational scripts
```

---

## Branching Strategy

We use **GitHub Flow**:

| Branch pattern | Purpose |
|----------------|---------|
| `main` | Production-ready code. PRs require review. |
| `copilot/*` | Agent/automation PRs |
| `feature/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `docs/<name>` | Documentation only |
| `chore/<name>` | Build/tooling/config changes |

**Never commit directly to `main`.**

---

## Development Workflow

```bash
# 1. Create a branch
git checkout -b feature/my-feature

# 2. Make changes and commit frequently
git add .
git commit -m "feat(mcp-server): add document export endpoint"

# 3. Push and open a PR
git push origin feature/my-feature
```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer: Closes #123]
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`
Scopes: `mcp-server`, `rass-engine`, `embedding-service`, `frontend`, `docs`, `docker`

---

## Code Standards

### JavaScript / Node.js

- **ES Modules** in frontend (`import/export`); **CommonJS** in services (`require/module.exports`)
- Use `"use strict"` at the top of each Node.js file
- Prefer `async/await` over raw Promises
- Use Zod for input validation schemas; never trust `req.body` directly

### React

- Functional components with hooks only (no class components)
- MUI v5 (`@mui/material`) for all UI components
- Component files: `PascalCase.js`; utility files: `camelCase.js`

### Database (Prisma)

- **Never** instantiate `PrismaClient` in route files — always import from `mcp-server/src/prisma.js`
- Always write new migrations with `npx prisma migrate dev --name <description>`
- Include `createdAt` and `updatedAt` on new models

### Security

- Always sanitise and validate inputs with Zod before using in queries
- Never log JWT tokens, API keys, or passwords
- Use `bcryptjs` with ≥ 12 rounds for password hashing
- Rate limit all public-facing endpoints

---

## Testing

### Running Tests

```bash
# MCP Server unit tests
cd mcp-server && npm test

# Rass Engine unit tests
cd rass-engine-service && npm test

# Embedding Service unit tests
cd embedding-service && npm test
```

### Writing Tests

- Use **Jest** for all unit tests (already configured in each service)
- Test files: `*.test.js` co-located with source files or in `src/__tests__/`
- Mock external calls (Prisma, OpenSearch, Redis, LLM) with `jest.mock()`
- Aim for ≥ 80% coverage on new code in `src/`

---

## Pull Request Process

1. **Open a PR** against `main` with a clear title and description
2. **Fill in the PR template** including the `Closes #xxx` footer
3. **Ensure all checks pass**: lint, unit tests, security scan
4. **Request review** from at least one maintainer
5. **Address feedback** via new commits (do not force-push during review)
6. PRs are **squash-merged** into main after approval

### PR Checklist

- [ ] Code follows style guidelines above
- [ ] New code is covered by tests
- [ ] `openapi.yaml` is updated if new endpoints are added
- [ ] README or relevant docs updated
- [ ] No secrets committed

---

## Issue Reporting

Please use the **GitHub Issue tracker** and include:

1. **What you expected** to happen
2. **What actually happened** (error messages, stack traces)
3. **Steps to reproduce**
4. **Environment** (OS, Node version, Docker version)

For security vulnerabilities, **do not** open a public issue — contact the maintainers directly.
