"""Simple SQLite data layer for Rehab.io — just patients and providers."""
import sqlite3, os
from datetime import datetime, timezone
from uuid import uuid4

DB_PATH = os.path.join(os.path.dirname(__file__), "rehab.db")
_conn = None

def get_conn():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
    return _conn

def init_db():
    get_conn().executescript("""
        CREATE TABLE IF NOT EXISTS providers (
            provider_id TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            email       TEXT UNIQUE NOT NULL,
            created_at  TEXT
        );
        CREATE TABLE IF NOT EXISTS patients (
            patient_id  TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            email       TEXT UNIQUE NOT NULL,
            created_at  TEXT
        );
    """)
    get_conn().commit()

# --- Providers ---
def create_provider(name, email):
    pid = f"pt_{uuid4().hex[:8]}"
    ts = datetime.now(timezone.utc).isoformat()
    get_conn().execute("INSERT INTO providers (provider_id,name,email,created_at) VALUES (?,?,?,?)",
                       (pid, name, email, ts))
    get_conn().commit()
    return {"provider_id": pid, "name": name, "email": email, "created_at": ts}

def login_provider(email):
    row = get_conn().execute("SELECT * FROM providers WHERE email=?", (email,)).fetchone()
    return dict(row) if row else None

def list_providers():
    return [dict(r) for r in get_conn().execute("SELECT * FROM providers").fetchall()]

# --- Patients ---
def create_patient(name, email):
    pid = f"p_{uuid4().hex[:8]}"
    ts = datetime.now(timezone.utc).isoformat()
    get_conn().execute("INSERT INTO patients (patient_id,name,email,created_at) VALUES (?,?,?,?)",
                       (pid, name, email, ts))
    get_conn().commit()
    return {"patient_id": pid, "name": name, "email": email, "created_at": ts}

def login_patient(email):
    row = get_conn().execute("SELECT * FROM patients WHERE email=?", (email,)).fetchone()
    return dict(row) if row else None

def list_patients():
    return [dict(r) for r in get_conn().execute("SELECT * FROM patients").fetchall()]
