# Project structure

- `api/main.py` — FastAPI routes and request validation
- `api/db.py` — schema (created/migrated on startup) and queries
- `api/test_*.py` — pytest suites (auth, exercises, care plans, sessions)
- `shared/poseLandmarks.json` — MediaPipe's 33 landmark names in index order
- `shared/exerciseLibrary.json` — exercises and the 3 landmarks each one measures
- `web/src/pages/` — screens (provider: dashboard, plan creation, handout, progress;
  patient: home, join via QR, plan briefing, consent, live session)
- `web/src/exercises/library.ts` — stick-figure motions per exercise
- `web/src/pose/` — MediaPipe loader and pure tracking logic (angles, smoothing, rep counting)
- `web/src/handout/pdf.ts` — PDF handout generation
- `.kiro/specs/rehab-io/plan.md` — the phased implementation plan produced with Kiro
