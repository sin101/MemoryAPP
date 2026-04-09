#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

stop_by_pid_file() {
  local file="$ROOT/$1"
  local name=$2
  if [ -f "$file" ]; then
    PID=$(cat "$file")
    if kill -0 "$PID" 2>/dev/null; then
      kill -TERM "$PID" 2>/dev/null
      # Give it 3 seconds to exit gracefully, then force
      for i in 1 2 3; do
        sleep 1
        kill -0 "$PID" 2>/dev/null || break
      done
      if kill -0 "$PID" 2>/dev/null; then
        kill -KILL "$PID" 2>/dev/null
        echo "$name force-killed (PID: $PID)"
      else
        echo "$name stopped gracefully (PID: $PID)"
      fi
    else
      echo "$name was not running"
    fi
    rm -f "$file"
  else
    echo "No PID file for $name — trying by port..."
  fi
}

# ── Stop via PID files ─────────────────────────────────────────
stop_by_pid_file .backend.pid  "Backend"
stop_by_pid_file .frontend.pid "Frontend"

# ── Fallback: kill by port (Windows via taskkill) ──────────────
kill_port_windows() {
  local port=$1
  local name=$2
  local pids
  pids=$(cmd.exe /C "netstat -ano" 2>/dev/null \
    | grep ":${port}[[:space:]]" \
    | awk '{print $5}' \
    | sort -u)
  for pid in $pids; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    cmd.exe /C "taskkill /PID $pid /F" 2>/dev/null \
      && echo "$name process $pid killed (port $port)"
  done
}

kill_port_windows 3000 "Backend"
kill_port_windows 5173 "Frontend"

echo "Done."
