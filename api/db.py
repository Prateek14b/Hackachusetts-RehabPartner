"""Postgres data layer for Rehab.io — just patients and providers.

Locally this talks to the Postgres in docker-compose.yml; in AWS it points at Aurora DSQL
(Postgres-compatible) by setting DATABASE_URL.
"""
import atexit, os
from datetime import datetime, timezone
from uuid import uuid4

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://rehab:rehab@localhost:5433/rehab")
_pool = None

def get_pool():
    global _pool
    if _pool is None:
        # autocommit: every statement is its own transaction (Aurora DSQL also requires
        # DDL statements to run one per transaction).
        # prepare_threshold=None: no server-side prepared statements — a cached `SELECT *` plan
        # breaks when a table gains a column.
        _pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, open=True,
                               kwargs={"row_factory": dict_row, "autocommit": True, "prepare_threshold": None})
        atexit.register(close_pool)
    return _pool

def close_pool():
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None

def _execute(sql, params=None):
    with get_pool().connection() as conn:
        return conn.execute(sql, params)

def _fetchone(sql, params=None):
    with get_pool().connection() as conn:
        return conn.execute(sql, params).fetchone()

def _fetchall(sql, params=None):
    with get_pool().connection() as conn:
        return conn.execute(sql, params).fetchall()

def init_db():
    _execute("""
        CREATE TABLE IF NOT EXISTS providers (
            provider_id TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            email       TEXT UNIQUE NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL
        )
    """)
    _execute("""
        CREATE TABLE IF NOT EXISTS patients (
            patient_id  TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            email       TEXT UNIQUE NOT NULL,
            age         INTEGER CHECK (age BETWEEN 0 AND 120),
            sex_assigned_at_birth TEXT
                CHECK (sex_assigned_at_birth IN ('female', 'male', 'intersex', 'prefer_not_to_say')),
            gender_identity       TEXT,
            created_at  TIMESTAMPTZ NOT NULL
        )
    """)
    # CREATE TABLE IF NOT EXISTS won't alter an existing table, so add new columns to old DBs here
    _execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS age INTEGER")
    _execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex_assigned_at_birth TEXT")
    _execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender_identity TEXT")

# --- Providers ---
def create_provider(name, email):
    return _fetchone(
        "INSERT INTO providers (provider_id,name,email,created_at) VALUES (%s,%s,%s,%s) RETURNING *",
        (f"pt_{uuid4().hex[:8]}", name, email, datetime.now(timezone.utc)))

def login_provider(email):
    return _fetchone("SELECT * FROM providers WHERE email=%s", (email,))

def list_providers():
    return _fetchall("SELECT * FROM providers ORDER BY created_at")

# --- Patients ---
def create_patient(name, email, age=None, sex_assigned_at_birth=None, gender_identity=None):
    return _fetchone(
        "INSERT INTO patients (patient_id,name,email,age,sex_assigned_at_birth,gender_identity,created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (f"p_{uuid4().hex[:8]}", name, email, age, sex_assigned_at_birth, gender_identity,
         datetime.now(timezone.utc)))

def login_patient(email):
    return _fetchone("SELECT * FROM patients WHERE email=%s", (email,))

def list_patients():
    return _fetchall("SELECT * FROM patients ORDER BY created_at")
