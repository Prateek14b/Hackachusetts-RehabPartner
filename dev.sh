#!/usr/bin/env bash
# Start the API (http://localhost:8000) and the web app (http://localhost:5173) together.
# Both hot-reload on file changes. Ctrl+C stops both.
cd "$(dirname "$0")"
trap 'kill 0' EXIT
(cd api && python3 -m uvicorn main:app --reload --port 8000) &
(cd web && npm run dev) &
wait
