#!/bin/sh
# demo/seed.sh
# Runs inside the demo-seeder container after all services start.
# Creates a demo user, uploads sample documents, and creates a demo knowledge base.

set -e

MCP="${MCP_SERVER_URL:-http://mcp-server:8080}"
USERNAME="${DEMO_USERNAME:-demo}"
PASSWORD="${DEMO_PASSWORD:-rass-demo-2025}"

echo "[demo-seeder] Waiting for MCP Server to be ready..."
for i in $(seq 1 30); do
  if wget -q -O- "$MCP/api/health" > /dev/null 2>&1; then
    echo "[demo-seeder] MCP Server is ready."
    break
  fi
  echo "[demo-seeder] Waiting... ($i/30)"
  sleep 5
done

echo "[demo-seeder] Registering demo user '$USERNAME'..."
REGISTER_RESP=$(wget -q -O- \
  --post-data="{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  --header="Content-Type: application/json" \
  "$MCP/api/auth/register" 2>&1) || true

echo "[demo-seeder] Logging in as '$USERNAME'..."
LOGIN_RESP=$(wget -q -O- \
  --post-data="{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  --header="Content-Type: application/json" \
  "$MCP/api/auth/login" 2>&1)

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
if [ -z "$TOKEN" ]; then
  echo "[demo-seeder] ERROR: Could not obtain auth token. Login response:"
  echo "$LOGIN_RESP"
  exit 1
fi

echo "[demo-seeder] Got auth token. Creating demo knowledge base..."
KB_RESP=$(wget -q -O- \
  --post-data='{"name":"RASS Demo KB","description":"Pre-seeded sample documents for the RASS demo"}' \
  --header="Content-Type: application/json" \
  --header="Authorization: Bearer $TOKEN" \
  "$MCP/api/knowledge-bases" 2>&1)

KB_ID=$(echo "$KB_RESP" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
echo "[demo-seeder] Created KB: $KB_ID"

echo "[demo-seeder] Uploading seed documents..."
for f in /seed_data/*.txt /seed_data/*.md /seed_data/*.pdf; do
  [ -f "$f" ] || continue
  echo "[demo-seeder]   Uploading: $f"
  curl -s -S \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$f" \
    "$MCP/api/embed-upload?kbId=$KB_ID" > /dev/null || \
    echo "[demo-seeder]   Warning: upload may have failed for $f (continuing)"
done

echo "[demo-seeder] Seed complete!"
echo ""
echo "  Demo credentials:"
echo "  Username: $USERNAME"
echo "  Password: $PASSWORD"
echo "  URL:      http://localhost:3000"
echo ""
