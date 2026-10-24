"""Postgres data layer for Rehab.io — patients, providers, the exercise library, and care plans.

Locally this talks to the Postgres in docker-compose.yml; in AWS it points at Aurora DSQL
(Postgres-compatible) by setting DATABASE_URL.
"""
import atexit, json, os
from datetime import datetime, timezone
from uuid import uuid4

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

SHARED_DIR = os.path.join(os.path.dirname(__file__), "..", "shared")

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
    _init_exercise_tables()
    _init_care_plan_tables()

def load_shared(filename):
    with open(os.path.join(SHARED_DIR, filename)) as f:
        return json.load(f)

# --- Exercise library ---
# Landmark names are MediaPipe's PoseLandmark names, and landmark_index is the position in
# MediaPipe's output arrays, so the live webcam check can look points up directly.

def _init_exercise_tables():
    _execute("""
        CREATE TABLE IF NOT EXISTS pose_landmarks (
            landmark_index SMALLINT PRIMARY KEY CHECK (landmark_index BETWEEN 0 AND 32),
            name           TEXT UNIQUE NOT NULL
        )
    """)
    _execute("""
        CREATE TABLE IF NOT EXISTS exercises (
            exercise_id  TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            metric       TEXT NOT NULL,
            hint         TEXT,
            full_rom     INTEGER NOT NULL,
            min_rom      INTEGER NOT NULL,
            -- value shown to the PT / stored as a target = angle_offset + angle_sign * interior angle
            angle_offset INTEGER NOT NULL,
            angle_sign   SMALLINT NOT NULL CHECK (angle_sign IN (-1, 1)),
            CHECK (0 <= min_rom AND min_rom < full_rom)
        )
    """)
    _execute("""
        CREATE TABLE IF NOT EXISTS exercise_angle_points (
            exercise_id      TEXT NOT NULL REFERENCES exercises (exercise_id) ON DELETE CASCADE,
            side             TEXT NOT NULL CHECK (side IN ('left', 'right')),
            point_a_landmark TEXT NOT NULL REFERENCES pose_landmarks (name),
            vertex_landmark  TEXT NOT NULL REFERENCES pose_landmarks (name),  -- the angle is measured here
            point_c_landmark TEXT NOT NULL REFERENCES pose_landmarks (name),
            PRIMARY KEY (exercise_id, side)
        )
    """)
    _seed_exercise_library()

def _seed_exercise_library():
    """Upsert pose_landmarks and the exercise library from shared/*.json (safe to run on every start)."""
    for index, name in enumerate(load_shared("poseLandmarks.json")["landmarks"]):
        _execute("INSERT INTO pose_landmarks (landmark_index, name) VALUES (%s, %s) "
                 "ON CONFLICT (landmark_index) DO UPDATE SET name = EXCLUDED.name", (index, name))
    for ex in load_shared("exerciseLibrary.json")["exercises"]:
        _execute("""
            INSERT INTO exercises (exercise_id, name, metric, hint, full_rom, min_rom, angle_offset, angle_sign)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (exercise_id) DO UPDATE SET
                name = EXCLUDED.name, metric = EXCLUDED.metric, hint = EXCLUDED.hint,
                full_rom = EXCLUDED.full_rom, min_rom = EXCLUDED.min_rom,
                angle_offset = EXCLUDED.angle_offset, angle_sign = EXCLUDED.angle_sign
        """, (ex["id"], ex["name"], ex["metric"], ex["hint"], ex["fullRom"], ex["minRom"],
              ex["angleOffset"], ex["angleSign"]))
        for side, (a, vertex, c) in ex["anglePoints"].items():
            _execute("""
                INSERT INTO exercise_angle_points
                    (exercise_id, side, point_a_landmark, vertex_landmark, point_c_landmark)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (exercise_id, side) DO UPDATE SET
                    point_a_landmark = EXCLUDED.point_a_landmark,
                    vertex_landmark = EXCLUDED.vertex_landmark,
                    point_c_landmark = EXCLUDED.point_c_landmark
            """, (ex["id"], side, a, vertex, c))

def list_pose_landmarks():
    return _fetchall("SELECT * FROM pose_landmarks ORDER BY landmark_index")

def list_exercises():
    """Exercises with their angle points per side, including each landmark's MediaPipe index."""
    exercises = _fetchall("SELECT * FROM exercises ORDER BY exercise_id")
    points = _fetchall("""
        SELECT p.exercise_id, p.side,
               p.point_a_landmark, a.landmark_index AS point_a_index,
               p.vertex_landmark,  v.landmark_index AS vertex_index,
               p.point_c_landmark, c.landmark_index AS point_c_index
        FROM exercise_angle_points p
        JOIN pose_landmarks a ON a.name = p.point_a_landmark
        JOIN pose_landmarks v ON v.name = p.vertex_landmark
        JOIN pose_landmarks c ON c.name = p.point_c_landmark
    """)
    by_exercise = {}
    for p in points:
        by_exercise.setdefault(p.pop("exercise_id"), {})[p.pop("side")] = p
    for ex in exercises:
        ex["angle_points"] = by_exercise.get(ex["exercise_id"], {})
    return exercises

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

# --- Care plans ---

def _init_care_plan_tables():
    _execute("""
        CREATE TABLE IF NOT EXISTS care_plans (
            plan_id      TEXT PRIMARY KEY,
            patient_id   TEXT NOT NULL REFERENCES patients (patient_id),
            provider_id  TEXT NOT NULL REFERENCES providers (provider_id),
            therapy_type TEXT CHECK (therapy_type IN ('orthopedic', 'pediatric', 'cardiovascular', 'sports')),
            created_at   TIMESTAMPTZ NOT NULL
        )
    """)
    _execute("""
        CREATE TABLE IF NOT EXISTS plan_exercises (
            plan_id     TEXT NOT NULL REFERENCES care_plans (plan_id) ON DELETE CASCADE,
            position    INTEGER NOT NULL CHECK (position >= 0),
            exercise_id TEXT REFERENCES exercises (exercise_id),  -- NULL for a custom ("Other") exercise
            custom_name TEXT,
            sets        INTEGER NOT NULL CHECK (sets >= 1),
            reps        INTEGER NOT NULL CHECK (reps >= 1),
            target_rom  INTEGER CHECK (target_rom >= 0),  -- the PT's slider value, in the exercise's metric
            side        TEXT NOT NULL DEFAULT 'both' CHECK (side IN ('left', 'right', 'both')),
            PRIMARY KEY (plan_id, position),
            -- either a library exercise (with a target ROM) or a custom one (name only, no ROM)
            CHECK ((exercise_id IS NULL) <> (custom_name IS NULL)),
            CHECK ((exercise_id IS NULL) = (target_rom IS NULL))
        )
    """)

def get_exercise(exercise_id):
    return _fetchone("SELECT * FROM exercises WHERE exercise_id = %s", (exercise_id,))

def get_provider(provider_id):
    return _fetchone("SELECT * FROM providers WHERE provider_id = %s", (provider_id,))

def create_care_plan(provider_id, patient_id, therapy_type, exercises):
    """Insert the plan and all its exercises in one transaction — all or nothing."""
    plan_id = f"cp_{uuid4().hex[:8]}"
    with get_pool().connection() as conn, conn.transaction():
        conn.execute(
            "INSERT INTO care_plans (plan_id, patient_id, provider_id, therapy_type, created_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            (plan_id, patient_id, provider_id, therapy_type, datetime.now(timezone.utc)))
        for position, ex in enumerate(exercises):
            conn.execute(
                "INSERT INTO plan_exercises (plan_id, position, exercise_id, custom_name, sets, reps, target_rom, side) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (plan_id, position, ex["exercise_id"], ex["custom_name"], ex["sets"], ex["reps"],
                 ex["target_rom"], ex["side"]))
    return get_care_plan(plan_id)

def get_care_plan(plan_id):
    plan = _fetchone("""
        SELECT cp.*, p.name AS patient_name, p.email AS patient_email
        FROM care_plans cp JOIN patients p ON p.patient_id = cp.patient_id
        WHERE cp.plan_id = %s
    """, (plan_id,))
    if plan:
        plan["exercises"] = _fetchall("""
            SELECT pe.position, pe.exercise_id, COALESCE(e.name, pe.custom_name) AS name, pe.custom_name,
                   pe.sets, pe.reps, pe.target_rom, e.metric, pe.side
            FROM plan_exercises pe LEFT JOIN exercises e ON e.exercise_id = pe.exercise_id
            WHERE pe.plan_id = %s ORDER BY pe.position
        """, (plan_id,))
    return plan

def list_care_plans(provider_id):
    return _fetchall("""
        SELECT cp.*, p.name AS patient_name, p.email AS patient_email, COUNT(pe.position) AS exercise_count
        FROM care_plans cp
        JOIN patients p ON p.patient_id = cp.patient_id
        LEFT JOIN plan_exercises pe ON pe.plan_id = cp.plan_id
        WHERE cp.provider_id = %s
        GROUP BY cp.plan_id, p.name, p.email
        ORDER BY cp.created_at DESC
    """, (provider_id,))
