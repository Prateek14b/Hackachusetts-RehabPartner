"""Pytest fixtures — every test gets a fresh in-memory SQLite DB (rehab.db is never touched)."""
import os, sqlite3, sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402


def _memory_conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


db._conn = _memory_conn()  # main runs init_db() on import — keep that off the real rehab.db
from main import app  # noqa: E402


@pytest.fixture
def client():
    conn = _memory_conn()
    db._conn = conn
    db.init_db()
    yield TestClient(app)
    conn.close()
    db._conn = None
