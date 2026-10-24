"""Pytest fixtures — tests run against the separate rehab_test database, never the dev database.

Needs the docker-compose Postgres running: `docker compose up -d --wait`.
"""
import os, sys

import pytest
from fastapi.testclient import TestClient

# Must be set before db is imported (main runs init_db() on import)
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://rehab:rehab@localhost:5433/rehab_test")

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture
def client():
    # fresh tables for every test
    db._execute("DROP TABLE IF EXISTS patients")
    db._execute("DROP TABLE IF EXISTS providers")
    db.init_db()
    yield TestClient(app)
