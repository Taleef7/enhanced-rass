# RASS Demo

The `demo/` directory contains a separate compose file and sample seed documents for a demo-oriented environment.

## What is in the demo folder

- `docker-compose.demo.yml`
- `seed_data/`
- `seed.sh`

## Important status note

Treat the demo stack as a secondary path, not the canonical local-development path.

The most reliable way to run RASS today is:

1. start the root backend stack
2. run the frontend locally with `npm start`

## Intended demo flow

```bash
./scripts/demo.sh
```

The script is intended to:

- start the demo compose stack
- wait for `mcp-server`
- seed a demo user and demo documents

## Demo content

The seed documents under `seed_data/` explain RAG and the RASS architecture at a high level. They are demo content, not canonical engineering documentation.

## Caveats

- The demo compose file should not be used as the source of truth for service behavior.
- If you need an accurate picture of the system, use the root compose file plus the current service code and README files.
