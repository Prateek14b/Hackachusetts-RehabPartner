# Tech stack

- **Backend:** Python FastAPI (`api/`), Postgres via psycopg 3 + connection pool, Mangum handler for Lambda.
  Local Postgres runs in Docker (`docker-compose.yml`, port 5433). `DATABASE_URL` points it elsewhere
  (target: Aurora DSQL, so stay Postgres-compatible: one DDL statement per transaction, no triggers).
- **Frontend:** React 18 + TypeScript + Vite + Tailwind v4 + React Router (`web/`).
- **Pose tracking:** `@mediapipe/tasks-vision` Pose Landmarker (loaded lazily from the CDN).
- **PDF/QR:** jsPDF + qrcode, loaded only when a handout is generated.

Conventions:
- Pin exact dependency versions.
- Landmark names must match MediaPipe's `PoseLandmark` enum exactly; `shared/*.json` is the single
  source of truth for landmarks and the exercise library (read by both API and web).
- Validate in the API and enforce in the DB (CHECK / FOREIGN KEY constraints).
- Tests: `cd api && python3 -m pytest` (runs against the separate `rehab_test` database).
- Run everything: `./dev.sh`.
