"""FastAPI for Rehab.io — patient & provider registration/login, the exercise library, and care plans."""
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

    @field_validator("gender_identity", mode="before")
    @classmethod
    def blank_gender_to_none(cls, v):
        return _blank_to_none(v)


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
    patient_email: EmailStr  # the patient must already have signed up
    therapy_type: Literal["orthopedic", "pediatric", "cardiovascular", "sports"] | None = None
    exercises: list[PlanExerciseBody] = Field(min_length=1)

    @field_validator("patient_email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        return _normalize_email(v)


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
                                 body.sex_assigned_at_birth, body.gender_identity)
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
    if not db.get_provider(body.provider_id):
        raise HTTPException(404, "Provider account not found. Please log in again.")
    patient = db.login_patient(body.patient_email)
    if not patient:
        raise HTTPException(404, "No patient account with that email. Ask the patient to sign up first.")
    for n, ex in enumerate(body.exercises, start=1):
        _check_plan_exercise(n, ex)
    return db.create_care_plan(body.provider_id, patient["patient_id"], body.therapy_type,
                               [ex.model_dump() for ex in body.exercises])


@app.get("/care-plans")
def list_care_plans(provider_id: str):
    return db.list_care_plans(provider_id)


@app.get("/care-plans/{plan_id}")
def get_care_plan(plan_id: str):
    plan = db.get_care_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Care plan not found")
    return plan


handler = Mangum(app, lifespan="off")
