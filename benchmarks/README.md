# RASS Performance Benchmarking Suite

This directory contains k6 load tests and supporting scripts for measuring RASS performance.

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation) (load testing tool)
- [jq](https://stedolan.github.io/jq/) (JSON processing)
- Docker + Docker Compose (to run the RASS stack locally)

## Quick Start

```bash
# Run the full benchmark suite (starts the stack automatically)
./benchmarks/run_benchmarks.sh

# Run against an already-running stack
./benchmarks/run_benchmarks.sh --no-stack

# Run only the query load test
./benchmarks/run_benchmarks.sh --no-stack --skip-ingestion --auth-token "your-jwt-token"

# Run with custom URLs
./benchmarks/run_benchmarks.sh \
  --no-stack \
  --base-url http://localhost:8080 \
  --embed-url http://localhost:8001
```

## Test Files

| File | Description |
|------|-------------|
| `query_load.js` | Load tests `/api/stream-ask` — measures query latency and throughput |
| `ingestion_load.js` | Load tests `/upload` — measures document ingestion throughput |
| `run_benchmarks.sh` | Orchestrates both tests and generates summary reports |

## Scenarios

### `query_load.js`

| Scenario | VUs | Duration | Purpose |
|----------|-----|----------|---------|
| `steady_state` | 10 | 2 min | Baseline throughput and latency |
| `ramp_up` | 1→50 | 5 min | Stress test and bottleneck identification |

**Thresholds:**
- `p95 < 3000 ms` (95th percentile request duration)
- `error rate < 1 %`

### `ingestion_load.js`

| Scenario | VUs | Duration | Purpose |
|----------|-----|----------|---------|
| `concurrent_uploads` | 10 | 3 min | Concurrent document upload throughput |

**Thresholds:**
- `p95 < 10000 ms` (upload + queue acceptance)
- `error rate < 1 %`

## Results

Results are saved to `benchmarks/results/<timestamp>/`:

```
results/20260312T120000/
├── query_load.json        # Raw k6 NDJSON output (gitignored)
├── query_summary.json     # Extracted p50/p95/p99 latency metrics
├── ingestion_load.json    # Raw k6 NDJSON output (gitignored)
├── ingestion_summary.json # Extracted upload latency metrics
└── summary.md             # Markdown summary table
```

## Baselines

The committed baseline is at `benchmarks/baselines/baseline_v1.json`.

The `run_benchmarks.sh` script compares the current p95 latency against the baseline and **exits non-zero** if the regression exceeds the threshold (default: 20%).

### Updating the Baseline

After a deliberate performance improvement, update the baseline:

```bash
# Run benchmarks and capture summary
./benchmarks/run_benchmarks.sh --no-stack

# Copy the new summary as the baseline
cp benchmarks/results/$(ls -t benchmarks/results/ | head -1)/query_summary.json \
   benchmarks/baselines/baseline_v1.json

# Update the metadata fields manually and commit
git add benchmarks/baselines/baseline_v1.json
git commit -m "perf: update benchmark baseline after optimization"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:8080` | mcp-server URL for query tests |
| `BASE_URL` | `http://localhost:8001` | embedding-service URL for ingestion tests |
| `AUTH_TOKEN` | _(empty)_ | JWT bearer token for authenticated endpoints |
| `USER_ID` | `benchmark-user` | User ID for ingestion tests |
