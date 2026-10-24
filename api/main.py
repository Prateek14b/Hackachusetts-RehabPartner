"""FastAPI application for Rehab.io backend.

Currently handles user management (Clinics, Providers, Patients) with
DynamoDB Local. More routes are added incrementally in later tasks.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel

from dynamodb import (
    create_all_tables,
    get_table,
    query_by_gsi,
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ClinicCreate(BaseModel):
    name: str
    address: str = ""


class ProviderCreate(BaseModel):
    name: str
    email: str = ""
    clinic_id: str
    role: str = "PT"


class PatientCreate(BaseModel):
    name: str
    dob: str  # ISO date string e.g. "1952-03-15"
    age: int
    sex: str  # "male" or "female"
    limitations: str = ""
    clinic_id: str | None = None
    status: str = "active"


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Rehab.io API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    """Create DynamoDB tables on startup (idempotent)."""
    create_all_tables()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Clinics
# ---------------------------------------------------------------------------
@app.get("/clinics")
def list_clinics():
    table = get_table("Clinics")
    response = table.scan()
    return response.get("Items", [])


@app.get("/clinics/{clinic_id}")
def get_clinic(clinic_id: str):
    table = get_table("Clinics")
    item = table.get_item(Key={"clinic_id": clinic_id})
    if "Item" not in item:
        raise HTTPException(404, "Clinic not found")
    return item["Item"]


@app.post("/clinics")
def create_clinic(body: ClinicCreate):
    clinic_id = f"c_{uuid4().hex[:8]}"
    item = {
        "clinic_id": clinic_id,
        "name": body.name,
        "address": body.address,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    get_table("Clinics").put_item(Item=item)
    return item


# ---------------------------------------------------------------------------
# Providers (PTs)
# ---------------------------------------------------------------------------
@app.get("/providers")
def list_providers(clinic_id: str | None = Query(None)):
    if clinic_id:
        return query_by_gsi("Providers", "clinic_id-index", "clinic_id", clinic_id)
    table = get_table("Providers")
    response = table.scan()
    return response.get("Items", [])


@app.get("/providers/{provider_id}")
def get_provider(provider_id: str):
    table = get_table("Providers")
    item = table.get_item(Key={"provider_id": provider_id})
    if "Item" not in item:
        raise HTTPException(404, "Provider not found")
    return item["Item"]


@app.post("/providers")
def create_provider(body: ProviderCreate):
    provider_id = f"pt_{uuid4().hex[:8]}"
    item = {
        "provider_id": provider_id,
        "clinic_id": body.clinic_id,
        "name": body.name,
        "email": body.email,
        "role": body.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    get_table("Providers").put_item(Item=item)
    return item


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------
@app.get("/patients")
def list_patients(clinic_id: str | None = Query(None)):
    if clinic_id:
        return query_by_gsi("Patients", "clinic_id-index", "clinic_id", clinic_id)
    table = get_table("Patients")
    response = table.scan()
    return response.get("Items", [])


@app.get("/patients/{patient_id}")
def get_patient(patient_id: str):
    table = get_table("Patients")
    item = table.get_item(Key={"patient_id": patient_id})
    if "Item" not in item:
        raise HTTPException(404, "Patient not found")
    return item["Item"]


@app.post("/patients")
def create_patient(body: PatientCreate):
    patient_id = f"p_{uuid4().hex[:8]}"
    item = {
        "patient_id": patient_id,
        "clinic_id": body.clinic_id,
        "name": body.name,
        "dob": body.dob,
        "age": body.age,
        "sex": body.sex,
        "limitations": body.limitations,
        "status": body.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    get_table("Patients").put_item(Item=item)
    return item


# Lambda handler
handler = Mangum(app, lifespan="off")
