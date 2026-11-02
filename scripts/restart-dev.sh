#!/bin/bash
# Restart PowerAI frontend + API with the latest code.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Stopping listeners on 5173/5174/5180/3001/3002..."
lsof -tiTCP:5173,5174,5180,3001,3002 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# Restore default API port in Vite proxy
python3 - <<'PY'
from pathlib import Path
path = Path("vite.config.ts")
text = path.read_text()
path.write_text(text.replace("localhost:3002", "localhost:3001"))
PY

echo "Starting npm run dev on http://localhost:5173 ..."
npm run dev
