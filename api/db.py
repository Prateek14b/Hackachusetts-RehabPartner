"""SQLite-based data layer for Rehab.io.

Mirrors the DynamoDB access patterns (get, put, scan, query-by-index) so
swapping to DynamoDB later is a drop-in replacement of this module.

Tables created incrementally as needed — currently only user tables:
Clinics, Providers, Patients.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

DB_PATH = os.environ.get("REHAB_DB_PATH", os.path.join(os.path.dirname(__file__), "rehab.db"))

# Global connection (SQLite handles concurrency via file locks)
_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
    return _conn


def init_db():
    """Create all tables if they don't exist (idempotent)."""
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS clinics (
            clinic_id   TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            address     TEXT DEFAULT '',
            created_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS providers (
            provider_id TEXT PRIMARY KEY,
            clinic_id   TEXT,
            name        TEXT NOT NULL,
            email       TEXT DEFAULT '',
            role        TEXT DEFAULT 'PT',
            created_at  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_providers_clinic ON providers(clinic_id);

        CREATE TABLE IF NOT EXISTS patients (
            patient_id   TEXT PRIMARY KEY,
            clinic_id     TEXT,
            name          TEXT NOT NULL,
            dob           TEXT,
            age           INTEGER,
            sex           TEXT,
            limitations   TEXT DEFAULT '',
            status        TEXT DEFAULT 'active',
            created_at    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
        """
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Generic helpers (mirror DynamoDB-style operations)
# ---------------------------------------------------------------------------
def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row) if row else {}


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Clinics
# ---------------------------------------------------------------------------
def list_clinics() -> list[dict]:
    conn = get_conn()
    return _rows_to_dicts(conn.execute("SELECT * FROM clinics").fetchall())


def get_clinic(clinic_id: str) -> dict | None:
    conn = get_conn()
    return _row_to_dict(conn.execute(
        "SELECT * FROM clinics WHERE clinic_id = ?", (clinic_id,)
    ).fetchone())


def put_clinic(clinic_id: str, name: str, address: str = "") -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO clinics (clinic_id, name, address, created_at) VALUES (?, ?, ?, ?)",
        (clinic_id, name, address, created_at),
    )
    conn.commit()
    return {"clinic_id": clinic_id, "name": name, "address": address, "created_at": created_at}


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
def list_providers(clinic_id: str | None = None) -> list[dict]:
    conn = get_conn()
    if clinic_id:
        return _rows_to_dicts(conn.execute(
            "SELECT * FROM providers WHERE clinic_id = ?", (clinic_id,)
        ).fetchall())
    return _rows_to_dicts(conn.execute("SELECT * FROM providers").fetchall())


def get_provider(provider_id: str) -> dict | None:
    conn = get_conn()
    return _row_to_dict(conn.execute(
        "SELECT * FROM providers WHERE provider_id = ?", (provider_id,)
    ).fetchone())


def put_provider(provider_id: str, clinic_id: str, name: str, email: str = "", role: str = "PT") -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO providers (provider_id, clinic_id, name, email, role, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (provider_id, clinic_id, name, email, role, created_at),
    )
    conn.commit()
    return {"provider_id": provider_id, "clinic_id": clinic_id, "name": name, "email": email, "role": role, "created_at": created_at}


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------
def list_patients(clinic_id: str | None = None) -> list[dict]:
    conn = get_conn()
    if clinic_id:
        return _rows_to_dicts(conn.execute(
            "SELECT * FROM patients WHERE clinic_id = ?", (clinic_id,)
        ).fetchall())
    return _rows_to_dicts(conn.execute("SELECT * FROM patients").fetchall())


def get_patient(patient_id: str) -> dict | None:
    conn = get_conn()
    return _row_to_dict(conn.execute(
        "SELECT * FROM patients WHERE patient_id = ?", (patient_id,)
    ).fetchone())


def put_patient(
    patient_id: str,
    name: str,
    dob: str,
    age: int,
    sex: str,
    limitations: str = "",
    clinic_id: str = "",
    status: str = "active",
) -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO patients "
        "(patient_id, clinic_id, name, dob, age, sex, limitations, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (patient_id, clinic_id, name, dob, age, sex, limitations, status, created_at),
    )
    conn.commit()
    return {
        "patient_id": patient_id,
        "clinic_id": clinic_id,
        "name": name,
        "dob": dob,
        "age": age,
        "sex": sex,
        "limitations": limitations,
        "status": status,
        "created_at": created_at,
    }
