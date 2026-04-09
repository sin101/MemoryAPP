#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── Build backend ──────────────────────────────────────────────
echo "Building backend..."
npm run build

# ── Start backend ──────────────────────────────────────────────
node dist/src/server.js &
BACKEND_PID=$!
echo $BACKEND_PID > .backend.pid

# Wait briefly and confirm it started
sleep 1
if ! kill -0 $BACKEND_PID 2>/dev/null; then
  echo "ERROR: Backend failed to start. Check that port 3000 is free."
  rm -f .backend.pid
  exit 1
fi

echo "Backend running on http://localhost:3000  (PID: $BACKEND_PID)"

# ── Start frontend ─────────────────────────────────────────────
cd frontend
npx vite &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$ROOT/.frontend.pid"
cd "$ROOT"

sleep 1
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
  echo "ERROR: Frontend failed to start."
  rm -f .frontend.pid
  exit 1
fi

echo "Frontend running on http://localhost:5173  (PID: $FRONTEND_PID)"
echo ""
echo "Run ./stop.sh to stop both servers."
