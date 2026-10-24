#!/usr/bin/env bash
# Start Postgres (Docker), the API (http://localhost:8000) and the web app (http://localhost:5173).
# The API and web app hot-reload on file changes. Ctrl+C stops both; the database keeps running
# in the background (stop it with `docker compose stop`).
cd "$(dirname "$0")"
docker compose up -d --wait db || { echo "Couldn't start Postgres — is Docker Desktop running?"; exit 1; }
trap 'kill 0' EXIT
(cd api && python3 -m uvicorn main:app --reload --port 8000) &
(cd web && npm run dev) &
wait
