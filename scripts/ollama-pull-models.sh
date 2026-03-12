#!/usr/bin/env bash
# scripts/ollama-pull-models.sh
# Phase G #135: Pull required Ollama models for local deployment.
#
# Run this after `docker compose up ollama` to download the default models.
# Adjust MODEL_LLM and MODEL_EMBED to match your config.yml values.
#
# Usage:
#   bash scripts/ollama-pull-models.sh [llm_model] [embed_model]
#
# Examples:
#   bash scripts/ollama-pull-models.sh                         # defaults: llama3.2, nomic-embed-text
#   bash scripts/ollama-pull-models.sh llama3.1 nomic-embed-text
#   bash scripts/ollama-pull-models.sh mistral mxbai-embed-large
#
# Environment variables:
#   OLLAMA_HOST  — Ollama server URL (default: http://localhost:11434)

set -euo pipefail

OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
MODEL_LLM="${1:-llama3.2}"
MODEL_EMBED="${2:-nomic-embed-text}"

# ── Helpers ───────────────────────────────────────────────────────────────────

log() { echo "[ollama-pull] $*"; }

wait_for_ollama() {
  log "Waiting for Ollama to be ready at ${OLLAMA_HOST}..."
  local max_wait=120
  local waited=0
  until curl -sf "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; do
    if (( waited >= max_wait )); then
      echo "[ollama-pull] ERROR: Ollama did not start within ${max_wait}s. Is the container running?" >&2
      exit 1
    fi
    sleep 3
    (( waited += 3 ))
  done
  log "Ollama is ready."
}

pull_model() {
  local model="$1"
  log "Pulling model: ${model}..."
  curl -sf \
    -X POST "${OLLAMA_HOST}/api/pull" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${model}\"}" \
    | while IFS= read -r line; do
        # Extract status field from streaming JSON — try jq, then python3, then raw
        if command -v jq >/dev/null 2>&1; then
          status=$(echo "${line}" | jq -r '.status // empty' 2>/dev/null || true)
        elif command -v python3 >/dev/null 2>&1; then
          status=$(echo "${line}" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('status',''))" 2>/dev/null || true)
        else
          status="${line}"
        fi
        [ -n "${status}" ] && echo "  → ${status}"
      done
  log "Model ${model} ready."
}

# ── Main ──────────────────────────────────────────────────────────────────────

log "Ollama Model Puller — Phase G #135"
log "LLM model  : ${MODEL_LLM}"
log "Embed model: ${MODEL_EMBED}"
log "Ollama host: ${OLLAMA_HOST}"
echo ""

wait_for_ollama

pull_model "${MODEL_LLM}"
pull_model "${MODEL_EMBED}"

log ""
log "✅ All models pulled successfully. RASS is ready for fully local operation."
log ""
log "Tip: Set in config.yml:"
log "  EMBEDDING_PROVIDER: ollama"
log "  LLM_PROVIDER: ollama"
log "  OLLAMA_LLM_MODEL: ${MODEL_LLM}"
log "  OLLAMA_EMBED_MODEL: ${MODEL_EMBED}"
