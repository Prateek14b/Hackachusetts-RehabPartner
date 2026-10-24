"""FastAPI for Rehab.io — patient & provider registration/login, the exercise library, and care plans."""
from datetime import date, datetime, timezone

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, field_validator
import db

app = FastAPI(title="Rehab.io API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
db.init_db()


def _normalize_email(v):
    # EmailStr only lowercases the domain; lowercase the whole address so lookups are case-insensitive
    return v.strip().lower() if isinstance(v, str) else v


def _normalize_name(name):
    """For matching a patient to an assigned plan: ignore case and extra spaces."""
    return " ".join((name or "").split()).casefold()


def _check_dob(v):
    if v is not None and not date(1900, 1, 1) <= v <= date.today():
        raise ValueError("date of birth must be between 1900 and today")
    return v


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class LoginBody(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        return _normalize_email(v)


class RegisterBody(LoginBody):
    name: str = Field(min_length=1)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v


class PatientRegisterBody(RegisterBody):
    age: int | None = Field(default=None, ge=0, le=120)
    # Sex at birth drives range-of-motion norms; gender identity is free text so any identity can be recorded
    sex_assigned_at_birth: Literal["female", "male", "intersex", "prefer_not_to_say"] | None = None
    gender_identity: str | None = Field(default=None, max_length=50)
    dob: date | None = None  # needed to open a care plan from a QR handout

    @field_validator("gender_identity", mode="before")
    @classmethod
    def blank_gender_to_none(cls, v):
        return _blank_to_none(v)

    @field_validator("dob")
    @classmethod
    def valid_dob(cls, v):
        return _check_dob(v)


class PlanExerciseBody(BaseModel):
    exercise_id: str | None = None  # a library exercise...
    custom_name: str | None = Field(default=None, max_length=100)  # ...or a custom ("Other") one
    sets: int = Field(ge=1, le=100)
    reps: int = Field(ge=1, le=1000)
    target_rom: int | None = None  # required for library exercises, must be within its min/full ROM
    side: Literal["left", "right", "both"] = "both"

    @field_validator("exercise_id", "custom_name", mode="before")
    @classmethod
    def blank_to_none(cls, v):
        return _blank_to_none(v)


class CarePlanBody(BaseModel):
    provider_id: str
    # who the plan is for; the patient may not have an account yet — they're matched when they scan the QR
    patient_name: str = Field(min_length=1, max_length=100)
    patient_dob: date
    patient_email: EmailStr
    therapy_type: Literal["orthopedic", "pediatric", "cardiovascular", "sports"] | None = None
    exercises: list[PlanExerciseBody] = Field(min_length=1)

    @field_validator("patient_email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        return _normalize_email(v)

    @field_validator("patient_name", mode="before")
    @classmethod
    def strip_name(cls, v):
        return " ".join(v.split()) if isinstance(v, str) else v

    @field_validator("patient_dob")
    @classmethod
    def valid_dob(cls, v):
        return _check_dob(v)


class ClaimBody(BaseModel):
    token: str = Field(min_length=1, max_length=200)
    patient_id: str


class ProviderBody(BaseModel):
    provider_id: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/providers/register")
def register_provider(body: RegisterBody):
    if db.login_provider(body.email):
        raise HTTPException(400, "Provider already exists")
    try:
        return db.create_provider(body.name, body.email)
    except psycopg.errors.UniqueViolation:  # lost a race with a concurrent registration
        raise HTTPException(400, "Provider already exists")


@app.post("/providers/login")
def login_provider(body: LoginBody):
    provider = db.login_provider(body.email)
    if not provider:
        raise HTTPException(404, "Provider not found")
    return provider


@app.get("/providers")
def list_providers():
    return db.list_providers()


@app.post("/patients/register")
def register_patient(body: PatientRegisterBody):
    if db.login_patient(body.email):
        raise HTTPException(400, "Patient already exists")
    try:
        return db.create_patient(body.name, body.email, body.age,
                                 body.sex_assigned_at_birth, body.gender_identity, body.dob)
    except psycopg.errors.UniqueViolation:  # lost a race with a concurrent registration
        raise HTTPException(400, "Patient already exists")


@app.post("/patients/login")
def login_patient(body: LoginBody):
    patient = db.login_patient(body.email)
    if not patient:
        raise HTTPException(404, "Patient not found")
    return patient


@app.get("/patients")
def list_patients():
    return db.list_patients()


@app.get("/pose-landmarks")
def list_pose_landmarks():
    return db.list_pose_landmarks()


@app.get("/exercises")
def list_exercises():
    return db.list_exercises()


def _check_plan_exercise(n, ex):
    """Rules that need the exercise library; raises 400 with a message naming the exercise row."""
    if (ex.exercise_id is None) == (ex.custom_name is None):
        raise HTTPException(400, f"Exercise {n}: choose an exercise from the list, or pick Other and enter a name.")
    if ex.custom_name is not None:
        if ex.target_rom is not None:
            raise HTTPException(400, f"Exercise {n}: custom exercises don't have a target range of motion.")
        return
    library = db.get_exercise(ex.exercise_id)
    if not library:
        raise HTTPException(400, f"Exercise {n}: unknown exercise '{ex.exercise_id}'.")
    if ex.target_rom is None:
        raise HTTPException(400, f"Exercise {n}: {library['name']} needs a target range of motion.")
    if not library["min_rom"] <= ex.target_rom <= library["full_rom"]:
        raise HTTPException(400, f"Exercise {n}: {library['name']} target must be between "
                                 f"{library['min_rom']}° and {library['full_rom']}°.")


@app.post("/care-plans")
def create_care_plan(body: CarePlanBody):
    """Save the plan for the named patient. The response includes `join_token` for the QR handout."""
    if not db.get_provider(body.provider_id):
        raise HTTPException(404, "Provider account not found. Please log in again.")
    for n, ex in enumerate(body.exercises, start=1):
        _check_plan_exercise(n, ex)
    return db.create_care_plan(body.provider_id, body.patient_name, body.patient_dob, body.patient_email,
                               body.therapy_type, [ex.model_dump() for ex in body.exercises])


@app.get("/care-plans")
def list_care_plans(provider_id: str):
    return db.list_care_plans(provider_id)


@app.get("/care-plans/{plan_id}")
def get_care_plan(plan_id: str, provider_id: str | None = None, patient_id: str | None = None):
    """Only the provider who made the plan, or the patient it's linked to, can read it."""
    plan = db.get_care_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Care plan not found")
    allowed = (provider_id and provider_id == plan["provider_id"]) or (patient_id and patient_id == plan["patient_id"])
    if not allowed:
        raise HTTPException(403, "You don't have access to this care plan.")
    return plan


@app.post("/care-plans/{plan_id}/join-token")
def new_join_token(plan_id: str, body: ProviderBody):
    """Make a new QR code for a plan's handout (the old QR stops working)."""
    plan = db.get_care_plan(plan_id)
    if not plan or plan["provider_id"] != body.provider_id:
        raise HTTPException(404, "Care plan not found")
    return {"join_token": db.rotate_join_token(plan_id)}


@app.post("/care-plans/claim")
def claim_care_plan(body: ClaimBody):
    """Called when a logged-in patient opens the QR link: link the plan if their details match."""
    plan = db.find_plan_by_token(body.token)
    if not plan:
        raise HTTPException(404, "This QR code isn't valid. Ask your clinic for a new handout.")
    patient = db.get_patient(body.patient_id)
    if not patient:
        raise HTTPException(404, "Patient account not found. Please log in again.")
    if plan["patient_id"] == patient["patient_id"]:
        return db.get_care_plan(plan["plan_id"])  # already linked to this patient
    if plan["patient_id"] is not None:
        raise HTTPException(403, "This care plan is already linked to another account.")
    if plan["token_expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(410, "This QR code has expired. Ask your clinic for a new handout.")
    if patient["dob"] is None:
        raise HTTPException(403, "Your account doesn't have a date of birth yet, so we can't confirm "
                                 "this plan is yours. Please contact your clinic.")
    matches = (patient["email"] == plan["assigned_email"] and patient["dob"] == plan["assigned_dob"]
               and _normalize_name(patient["name"]) == _normalize_name(plan["assigned_name"]))
    if not matches:
        raise HTTPException(403, "Your name, date of birth or email don't match the patient this plan was "
                                 "assigned to. Check your account details, or contact your clinic.")
    if not db.link_plan_to_patient(plan["plan_id"], patient["patient_id"]):
        raise HTTPException(403, "This care plan is already linked to another account.")
    return db.get_care_plan(plan["plan_id"])


@app.get("/patients/{patient_id}/care-plans")
def list_patient_care_plans(patient_id: str):
    return db.list_patient_care_plans(patient_id)


# --- Camera consent and exercise sessions ---

def _linked_plan(plan_id, patient_id):
    """The plan, if it's linked to this patient; otherwise 403/404."""
    plan = db.get_care_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Care plan not found")
    if plan["patient_id"] is None or plan["patient_id"] != patient_id:
        raise HTTPException(403, "You don't have access to this care plan.")
    return plan


class ConsentBody(BaseModel):
    patient_id: str
    version: str = Field(min_length=1, max_length=20)


@app.post("/care-plans/{plan_id}/consent")
def give_consent(plan_id: str, body: ConsentBody):
    """Record that the patient agreed to camera use for this plan's sessions."""
    _linked_plan(plan_id, body.patient_id)
    return db.record_consent(body.patient_id, plan_id, body.version)


@app.get("/care-plans/{plan_id}/consent")
def get_consent(plan_id: str, patient_id: str):
    _linked_plan(plan_id, patient_id)
    return {"consent": db.latest_consent(patient_id, plan_id)}


class SessionExerciseBody(BaseModel):
    position: int = Field(ge=0)
    sets_completed: int = Field(ge=0)
    reps_completed: int = Field(ge=0)
    reps_at_target: int = Field(ge=0)
    peak_rom: int | None = Field(default=None, ge=0)
    pain: int | None = Field(default=None, ge=0, le=10)


class SessionBody(BaseModel):
    patient_id: str
    started_at: datetime
    ended_at: datetime
    exercises: list[SessionExerciseBody]


@app.post("/care-plans/{plan_id}/sessions")
def save_session(plan_id: str, body: SessionBody):
    """Save a finished (or ended-early) session. Plan exercises not attempted are stored as zero."""
    plan = _linked_plan(plan_id, body.patient_id)
    if body.ended_at < body.started_at:
        raise HTTPException(400, "A session can't end before it starts.")
    by_position = {ex["position"]: ex for ex in plan["exercises"]}
    results = {}
    for r in body.exercises:
        planned = by_position.get(r.position)
        if planned is None:
            raise HTTPException(400, f"Exercise {r.position + 1} isn't part of this plan.")
        if r.position in results:
            raise HTTPException(400, f"Exercise {r.position + 1} was reported twice.")
        if r.sets_completed > planned["sets"] or r.reps_completed > planned["sets"] * planned["reps"]:
            raise HTTPException(400, f"Exercise {r.position + 1}: more sets or reps than the plan has.")
        if r.reps_at_target > r.reps_completed:
            raise HTTPException(400, f"Exercise {r.position + 1}: more reps at target than reps done.")
        if r.peak_rom is not None:
            library = db.get_exercise(planned["exercise_id"]) if planned["exercise_id"] else None
            if library is None:
                raise HTTPException(400, f"Exercise {r.position + 1} isn't camera-tracked, so it has no range of motion.")
            if r.peak_rom > library["full_rom"] + 30:
                raise HTTPException(400, f"Exercise {r.position + 1}: range of motion {r.peak_rom}° isn't plausible.")
        results[r.position] = r
    rows = []
    for position, planned in sorted(by_position.items()):
        r = results.get(position) or SessionExerciseBody(position=position, sets_completed=0, reps_completed=0,
                                                         reps_at_target=0)
        rows.append({**r.model_dump(), "exercise_id": planned["exercise_id"], "name": planned["name"],
                     "sets_target": planned["sets"], "reps_target": planned["reps"],
                     "target_rom": planned["target_rom"]})
    completed = all(row["sets_completed"] == row["sets_target"] for row in rows)
    session_id = db.create_session(plan_id, body.patient_id, body.started_at, body.ended_at, completed, rows)
    return next(s for s in _progress(plan_id)["sessions"] if s["session_id"] == session_id)


def _progress(plan_id):
    """Sessions plus each exercise's personal best range of motion, flagging sessions that set a new best."""
    sessions = db.list_sessions(plan_id)
    bests = {}
    for s in reversed(sessions):  # oldest first, so "new best" means better than every earlier session
        for ex in s["exercises"]:
            prev = bests.get(ex["position"])
            ex["new_best"] = ex["peak_rom"] is not None and (prev is None or ex["peak_rom"] > prev["best_rom"])
            if ex["new_best"]:
                bests[ex["position"]] = {"best_rom": ex["peak_rom"], "achieved_at": s["started_at"]}
    return {"sessions": sessions, "bests": bests}


@app.get("/care-plans/{plan_id}/progress")
def get_progress(plan_id: str, provider_id: str | None = None, patient_id: str | None = None):
    """Session history and personal bests, for the plan's provider or its linked patient."""
    plan = get_care_plan(plan_id, provider_id, patient_id)  # same access rule
    return {"plan": plan, **_progress(plan_id)}


handler = Mangum(app, lifespan="off")
