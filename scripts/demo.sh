#!/usr/bin/env bash
# scripts/demo.sh
# One-click RASS demo launcher.
# Starts the full stack using the demo docker-compose and seeds sample data.
#
# Usage: ./scripts/demo.sh [--clean]
#   --clean   Remove all demo volumes before starting (full reset)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_COMPOSE="$REPO_ROOT/demo/docker-compose.demo.yml"

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No colour

log()  { echo -e "${CYAN}[demo]${NC} $*"; }
ok()   { echo -e "${GREEN}[demo] ✓ $*${NC}"; }
warn() { echo -e "${YELLOW}[demo] ⚠ $*${NC}"; }

# ── Parse arguments ───────────────────────────────────────────────────────────
CLEAN=false
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    *) warn "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ── Verify prerequisites ──────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "ERROR: docker is not installed. Please install Docker." >&2
  exit 1
fi
if ! docker compose version &>/dev/null; then
  echo "ERROR: docker compose (v2) is required. Please upgrade Docker." >&2
  exit 1
fi

# ── Warn if no LLM key configured ────────────────────────────────────────────
if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
  warn "Neither OPENAI_API_KEY nor GEMINI_API_KEY is set."
  warn "LLM generation will not work, but retrieval and ingestion will."
  warn "Set your API key in .env and re-run this script."
fi

# ── Clean volumes if requested ────────────────────────────────────────────────
if [ "$CLEAN" = true ]; then
  log "Removing demo volumes for a clean start..."
  docker compose -f "$DEMO_COMPOSE" down -v --remove-orphans 2>/dev/null || true
  ok "Demo volumes removed."
fi

# ── Load .env if present ──────────────────────────────────────────────────────
if [ -f "$REPO_ROOT/.env" ]; then
  log "Loading .env file..."
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env"
  set +a
fi

# ── Start services ────────────────────────────────────────────────────────────
log "Starting RASS demo services..."
docker compose -f "$DEMO_COMPOSE" up -d --build

# ── Wait for MCP Server ───────────────────────────────────────────────────────
log "Waiting for MCP Server to be healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080/api/health > /dev/null 2>&1; then
    ok "MCP Server is healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    warn "MCP Server did not become healthy in time. Check logs:"
    warn "  docker compose -f demo/docker-compose.demo.yml logs mcp-server"
    exit 1
  fi
  sleep 5
done

# ── Show access info ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  RASS Demo is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Frontend:${NC}       http://localhost:3000"
echo -e "  ${CYAN}API Docs:${NC}       http://localhost:8080/api/docs"
echo -e "  ${CYAN}Health:${NC}         http://localhost:8080/api/health"
echo ""
echo -e "  ${CYAN}Demo login:${NC}     username: demo"
echo -e "               password: rass-demo-2025"
echo ""
echo -e "  ${YELLOW}Stop demo:${NC}     docker compose -f demo/docker-compose.demo.yml down"
echo -e "  ${YELLOW}Clean reset:${NC}   $0 --clean"
echo ""

# ── Open browser (best-effort) ────────────────────────────────────────────────
if command -v open &>/dev/null; then
  open http://localhost:3000 || true
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:3000 || true
fi
