#!/usr/bin/env bash
# benchmarks/run_benchmarks.sh
# ============================
# End-to-end benchmark runner for RASS.
#
# Prerequisites:
#   - Docker Compose stack running (or pass --no-stack to skip startup)
#   - k6 installed (https://k6.io/docs/getting-started/installation)
#   - jq installed (for JSON processing)
#
# Usage:
#   ./benchmarks/run_benchmarks.sh [OPTIONS]
#
# Options:
#   --no-stack        Skip docker-compose up (assume stack is already running)
#   --baseline        Path to baseline file for regression comparison
#                     (default: benchmarks/baselines/baseline_v1.json)
#   --output-dir      Directory to save results (default: benchmarks/results)
#   --base-url        mcp-server URL (default: http://localhost:8080)
#   --embed-url       embedding-service URL (default: http://localhost:8001)
#   --auth-token      JWT auth token for query load test
#   --skip-query      Skip the query load test
#   --skip-ingestion  Skip the ingestion load test
#   --help            Show this help message
#
# Exit codes:
#   0  All benchmarks passed all thresholds
#   1  One or more thresholds breached or regression detected
#   2  Prerequisites not met

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
OUTPUT_DIR="${SCRIPT_DIR}/results/${TIMESTAMP}"
BASELINE_FILE="${SCRIPT_DIR}/baselines/baseline_v1.json"
BASE_URL="http://localhost:8080"
EMBED_URL="http://localhost:8001"
AUTH_TOKEN=""
NO_STACK=false
SKIP_QUERY=false
SKIP_INGESTION=false

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-stack)        NO_STACK=true; shift ;;
    --baseline)        BASELINE_FILE="$2"; shift 2 ;;
    --output-dir)      OUTPUT_DIR="$2"; shift 2 ;;
    --base-url)        BASE_URL="$2"; shift 2 ;;
    --embed-url)       EMBED_URL="$2"; shift 2 ;;
    --auth-token)      AUTH_TOKEN="$2"; shift 2 ;;
    --skip-query)      SKIP_QUERY=true; shift ;;
    --skip-ingestion)  SKIP_INGESTION=true; shift ;;
    --help)
      head -40 "${BASH_SOURCE[0]}" | tail -36; exit 0 ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

# ── Prerequisite checks ───────────────────────────────────────────────────────
echo "==================================================================="
echo " RASS Performance Benchmark Suite — ${TIMESTAMP}"
echo "==================================================================="

if ! command -v k6 &>/dev/null; then
  echo "[ERROR] k6 is not installed. Install from https://k6.io/docs/getting-started/installation"
  exit 2
fi

if ! command -v jq &>/dev/null; then
  echo "[ERROR] jq is not installed. Install with: apt-get install jq / brew install jq"
  exit 2
fi

if ! command -v bc &>/dev/null; then
  echo "[ERROR] bc is not installed. Install with: apt-get install bc / brew install bc"
  exit 2
fi

k6_version=$(k6 version | head -1)
echo "[INFO] k6: ${k6_version}"
echo "[INFO] Output directory: ${OUTPUT_DIR}"

mkdir -p "${OUTPUT_DIR}"

# ── Start Docker Compose stack (optional) ─────────────────────────────────────
if [[ "${NO_STACK}" == "false" ]]; then
  echo "[INFO] Starting Docker Compose stack..."
  cd "${REPO_ROOT}"
  docker compose up -d --wait || true

  echo "[INFO] Waiting 30s for services to be ready..."
  sleep 30
fi

# ── Run query load test ───────────────────────────────────────────────────────
QUERY_RESULT_FILE="${OUTPUT_DIR}/query_load.json"
QUERY_SUMMARY_FILE="${OUTPUT_DIR}/query_summary.json"
QUERY_EXIT_CODE=0

if [[ "${SKIP_QUERY}" == "false" ]]; then
  echo ""
  echo "--- Query Load Test -----------------------------------------------"
  echo "[INFO] Running benchmarks/query_load.js..."

  k6 run \
    --env BASE_URL="${BASE_URL}" \
    --env AUTH_TOKEN="${AUTH_TOKEN}" \
    --out "json=${QUERY_RESULT_FILE}" \
    "${SCRIPT_DIR}/query_load.js" || QUERY_EXIT_CODE=$?

  echo "[INFO] Query load test complete (exit: ${QUERY_EXIT_CODE})"
  echo "[INFO] Raw results saved to ${QUERY_RESULT_FILE}"
else
  echo "[INFO] Skipping query load test (--skip-query)"
fi

# ── Run ingestion load test ───────────────────────────────────────────────────
INGESTION_RESULT_FILE="${OUTPUT_DIR}/ingestion_load.json"
INGESTION_EXIT_CODE=0

if [[ "${SKIP_INGESTION}" == "false" ]]; then
  echo ""
  echo "--- Ingestion Load Test -------------------------------------------"
  echo "[INFO] Running benchmarks/ingestion_load.js..."

  k6 run \
    --env BASE_URL="${EMBED_URL}" \
    --env USER_ID="benchmark-user" \
    --out "json=${INGESTION_RESULT_FILE}" \
    "${SCRIPT_DIR}/ingestion_load.js" || INGESTION_EXIT_CODE=$?

  echo "[INFO] Ingestion load test complete (exit: ${INGESTION_EXIT_CODE})"
  echo "[INFO] Raw results saved to ${INGESTION_RESULT_FILE}"
else
  echo "[INFO] Skipping ingestion load test (--skip-ingestion)"
fi

# ── Extract summary metrics and write summary JSON ────────────────────────────
echo ""
echo "--- Extracting Summary Metrics ------------------------------------"

write_summary() {
  local result_file="$1"
  local summary_file="$2"

  if [[ ! -f "${result_file}" ]]; then
    echo "[WARN] Result file not found: ${result_file}"
    return
  fi

  # Extract p95 and p99 from k6 JSON output using jq
  jq -s '
    map(select(.type == "Point" and .metric == "http_req_duration")) |
    {
      "p50":  (map(.data.value) | sort | .[floor(length * 0.50)]),
      "p95":  (map(.data.value) | sort | .[floor(length * 0.95)]),
      "p99":  (map(.data.value) | sort | .[floor(length * 0.99)]),
      "min":  (map(.data.value) | min),
      "max":  (map(.data.value) | max),
      "count": (map(.data.value) | length)
    }
  ' "${result_file}" > "${summary_file}" 2>/dev/null || echo "{}" > "${summary_file}"

  echo "[INFO] Summary written to ${summary_file}"
  if command -v jq &>/dev/null; then
    jq . "${summary_file}"
  fi
}

if [[ "${SKIP_QUERY}" == "false" ]]; then
  write_summary "${QUERY_RESULT_FILE}" "${OUTPUT_DIR}/query_summary.json"
fi

if [[ "${SKIP_INGESTION}" == "false" ]]; then
  write_summary "${INGESTION_RESULT_FILE}" "${OUTPUT_DIR}/ingestion_summary.json"
fi

# ── Baseline regression check ─────────────────────────────────────────────────
REGRESSION_EXIT_CODE=0

if [[ -f "${BASELINE_FILE}" ]]; then
  echo ""
  echo "--- Baseline Regression Check -------------------------------------"
  echo "[INFO] Comparing against baseline: ${BASELINE_FILE}"

  QUERY_SUMMARY="${OUTPUT_DIR}/query_summary.json"
  if [[ -f "${QUERY_SUMMARY}" && -f "${BASELINE_FILE}" ]]; then
    CURRENT_P95=$(jq -r '.p95 // 0' "${QUERY_SUMMARY}")
    BASELINE_P95=$(jq -r '.latency.p95_ms // 0' "${BASELINE_FILE}")

    echo "[INFO] Current p95: ${CURRENT_P95} ms"
    echo "[INFO] Baseline p95: ${BASELINE_P95} ms"

    if (( $(echo "${BASELINE_P95} > 0" | bc -l) )); then
      REGRESSION_PCT=$(echo "scale=2; (${CURRENT_P95} - ${BASELINE_P95}) / ${BASELINE_P95} * 100" | bc -l)
      THRESHOLD_PCT=$(jq -r '.regression_thresholds_pct.latency_p95 // 20' "${BASELINE_FILE}")

      echo "[INFO] Regression: ${REGRESSION_PCT}% (threshold: ${THRESHOLD_PCT}%)"

      if (( $(echo "${REGRESSION_PCT} > ${THRESHOLD_PCT}" | bc -l) )); then
        echo "[FAIL] p95 latency regression of ${REGRESSION_PCT}% exceeds threshold of ${THRESHOLD_PCT}%"
        REGRESSION_EXIT_CODE=1
      else
        echo "[PASS] Latency within acceptable bounds."
      fi
    fi
  fi
else
  echo "[INFO] No baseline file found at ${BASELINE_FILE}. Skipping regression check."
  echo "[INFO] Run this script once and commit the output as the baseline."
fi

# ── Generate Markdown summary table ───────────────────────────────────────────
MARKDOWN_FILE="${OUTPUT_DIR}/summary.md"
cat > "${MARKDOWN_FILE}" << MARKDOWN
# RASS Benchmark Results — ${TIMESTAMP}

## Environment
- **mcp-server**: ${BASE_URL}
- **embedding-service**: ${EMBED_URL}
- **Timestamp**: ${TIMESTAMP}

## Query Load Test

| Metric | Value |
|--------|-------|
| p50    | $(jq -r '.p50 // "N/A"' "${OUTPUT_DIR}/query_summary.json" 2>/dev/null || echo "N/A") ms |
| p95    | $(jq -r '.p95 // "N/A"' "${OUTPUT_DIR}/query_summary.json" 2>/dev/null || echo "N/A") ms |
| p99    | $(jq -r '.p99 // "N/A"' "${OUTPUT_DIR}/query_summary.json" 2>/dev/null || echo "N/A") ms |
| Count  | $(jq -r '.count // "N/A"' "${OUTPUT_DIR}/query_summary.json" 2>/dev/null || echo "N/A") |

## Ingestion Load Test

| Metric | Value |
|--------|-------|
| p50    | $(jq -r '.p50 // "N/A"' "${OUTPUT_DIR}/ingestion_summary.json" 2>/dev/null || echo "N/A") ms |
| p95    | $(jq -r '.p95 // "N/A"' "${OUTPUT_DIR}/ingestion_summary.json" 2>/dev/null || echo "N/A") ms |
| Count  | $(jq -r '.count // "N/A"' "${OUTPUT_DIR}/ingestion_summary.json" 2>/dev/null || echo "N/A") |
MARKDOWN

echo ""
echo "[INFO] Markdown summary written to ${MARKDOWN_FILE}"

# ── Final status ──────────────────────────────────────────────────────────────
echo ""
echo "==================================================================="
OVERALL_EXIT=$((QUERY_EXIT_CODE + INGESTION_EXIT_CODE + REGRESSION_EXIT_CODE))
if [[ "${OVERALL_EXIT}" -eq 0 ]]; then
  echo " RESULT: ALL BENCHMARKS PASSED ✓"
else
  echo " RESULT: ONE OR MORE BENCHMARKS FAILED ✗"
  echo "   Query load exit code:     ${QUERY_EXIT_CODE}"
  echo "   Ingestion load exit code: ${INGESTION_EXIT_CODE}"
  echo "   Regression check code:    ${REGRESSION_EXIT_CODE}"
fi
echo "==================================================================="

exit "${OVERALL_EXIT}"
