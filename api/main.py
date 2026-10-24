"""FastAPI for Rehab.io — patient & provider registration and login."""
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


class LoginBody(BaseModel):
    email: EmailStr

    # EmailStr only lowercases the domain; lowercase the whole address so lookups are case-insensitive
    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


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
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


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


handler = Mangum(app, lifespan="off")
