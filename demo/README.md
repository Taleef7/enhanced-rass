# RASS One-Click Demo

This directory contains everything needed to run a fully pre-seeded RASS demo in under 5 minutes.

## Quick Start

```bash
# From the repository root:
./scripts/demo.sh
```

Then open `http://localhost:3000` and log in with:
- **Username**: `demo`
- **Password**: `rass-demo-2025`

## What's Included

### Pre-seeded Documents

The `seed_data/` directory contains sample Markdown documents that are automatically uploaded and indexed when the demo starts:

| File | Description |
|------|-------------|
| `01-intro-to-rag.md` | Introduction to Retrieval-Augmented Generation |
| `02-system-architecture.md` | RASS architecture reference |
| `03-demo-guide.md` | Feature walkthrough and example questions |

### Demo Knowledge Base

A **"RASS Demo KB"** knowledge base is created automatically containing all seed documents.

### Demo User

A demo account (`demo` / `rass-demo-2025`) is created on first run.

## Architecture

The demo uses a separate Docker Compose configuration (`docker-compose.demo.yml`) that:
- Uses separate named volumes (`demo_*`) to avoid conflicts with a production install
- Includes a one-time `demo-seeder` service that registers the demo user and uploads seed documents
- Runs all services on the same ports as production (3000, 8080)

## Customizing Seed Data

To add your own documents to the demo:

1. Place files in `demo/seed_data/` (supported: `.txt`, `.md`, `.pdf`)
2. Re-run `./scripts/demo.sh`

## Stopping the Demo

```bash
docker compose -f demo/docker-compose.demo.yml down -v
```

The `-v` flag removes all demo volumes for a clean restart.
