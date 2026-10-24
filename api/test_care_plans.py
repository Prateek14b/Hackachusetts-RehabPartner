"""Care plan tests — a PT assigns a plan to a named patient (account optional); the patient opens it by
scanning the QR handout, and it's linked to their account only if their name, DOB and email match."""
import psycopg
import pytest

import db

MARGARET = {"name": "Margaret Chen", "email": "margaret@example.com", "dob": "1952-03-14"}


@pytest.fixture
def provider(client):
    return client.post("/providers/register", json={"name": "Dr. Sarah", "email": "sarah@clinic.com"}).json()


def plan_body(provider, **overrides):
    body = {
        "provider_id": provider["provider_id"],
        "patient_name": "Margaret Chen",
        "patient_dob": "1952-03-14",
        "patient_email": "margaret@example.com",
        "therapy_type": "orthopedic",
        "exercises": [
            {"exercise_id": "squat", "sets": 3, "reps": 10, "target_rom": 90},
            {"custom_name": "Wall push-up", "sets": 2, "reps": 12},
            {"exercise_id": "shoulder_raise", "sets": 3, "reps": 8, "target_rom": 150, "side": "left"},
        ],
    }
    body.update(overrides)
    return body


def register_patient(client, **overrides):
    return client.post("/patients/register", json={**MARGARET, **overrides}).json()


def rows(table):
    return db._fetchall(f"SELECT * FROM {table}")


def claim(client, plan, patient):
    return client.post("/care-plans/claim", json={"token": plan["join_token"], "patient_id": patient["patient_id"]})


# --- Saving a plan ---

def test_save_plan_without_patient_account(client, provider):
    r = client.post("/care-plans", json=plan_body(provider))
    assert r.status_code == 200
    plan = r.json()
    assert plan["patient_id"] is None and plan["status"] == "pending"
    assert len(plan["join_token"]) >= 30

    [cp] = rows("care_plans")
    assert (cp["assigned_name"], str(cp["assigned_dob"]), cp["assigned_email"]) == (
        "Margaret Chen", "1952-03-14", "margaret@example.com")
    assert cp["join_token_hash"] == db.hash_token(plan["join_token"])  # only the hash is stored
    assert plan["join_token"] not in str(cp)

    pe = db._fetchall("SELECT * FROM plan_exercises ORDER BY position")
    assert [(r["position"], r["exercise_id"], r["custom_name"], r["sets"], r["reps"], r["target_rom"], r["side"])
            for r in pe] == [
        (0, "squat", None, 3, 10, 90, "both"),
        (1, None, "Wall push-up", 2, 12, None, "both"),
        (2, "shoulder_raise", None, 3, 8, 150, "left"),
    ]


def test_saved_plan_returned_with_names_in_order(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    assert plan["assigned_name"] == "Margaret Chen" and plan["provider_name"] == "Dr. Sarah"
    assert [e["name"] for e in plan["exercises"]] == ["Squat", "Wall push-up", "Shoulder raise (forward)"]


def test_patient_name_and_email_normalized(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider, patient_name="  Margaret   Chen ",
                                                     patient_email=" Margaret@EXAMPLE.com ")).json()
    assert plan["assigned_name"] == "Margaret Chen" and plan["assigned_email"] == "margaret@example.com"


def test_list_plans_for_provider(client, provider):
    other = client.post("/providers/register", json={"name": "Dr. Other", "email": "other@clinic.com"}).json()
    client.post("/care-plans", json=plan_body(provider))
    client.post("/care-plans", json=plan_body(other))
    mine = client.get("/care-plans", params={"provider_id": provider["provider_id"]}).json()
    assert len(mine) == 1
    assert (mine[0]["assigned_name"], mine[0]["exercise_count"], mine[0]["patient_id"]) == ("Margaret Chen", 3, None)
    assert "join_token_hash" not in mine[0]


def test_therapy_type_optional(client, provider):
    r = client.post("/care-plans", json=plan_body(provider, therapy_type=None))
    assert r.status_code == 200 and r.json()["therapy_type"] is None


# --- Rejections: nothing is written ---

def assert_nothing_saved():
    assert rows("care_plans") == [] and rows("plan_exercises") == []


def test_unknown_provider_rejected(client, provider):
    r = client.post("/care-plans", json=plan_body(provider, provider_id="pt_nope"))
    assert r.status_code == 404
    assert_nothing_saved()


@pytest.mark.parametrize("exercise,message", [
    ({"exercise_id": "moonwalk", "sets": 3, "reps": 10, "target_rom": 50}, "unknown exercise"),
    ({"exercise_id": "squat", "sets": 3, "reps": 10}, "needs a target"),
    ({"exercise_id": "squat", "sets": 3, "reps": 10, "target_rom": 121}, "between 10° and 120°"),
    ({"exercise_id": "squat", "sets": 3, "reps": 10, "target_rom": 5}, "between 10° and 120°"),
    ({"custom_name": "Plank", "sets": 3, "reps": 10, "target_rom": 40}, "don't have a target"),
    ({"exercise_id": "squat", "custom_name": "Plank", "sets": 3, "reps": 10, "target_rom": 90}, "choose an exercise"),
    ({"sets": 3, "reps": 10}, "choose an exercise"),
    ({"exercise_id": "  ", "custom_name": "", "sets": 3, "reps": 10}, "choose an exercise"),
])
def test_invalid_exercise_row_rejected(client, provider, exercise, message):
    body = plan_body(provider)
    body["exercises"].append(exercise)
    r = client.post("/care-plans", json=body)
    assert r.status_code == 400
    assert r.json()["detail"].startswith("Exercise 4:") and message in r.json()["detail"]
    assert_nothing_saved()  # the 3 valid rows before it weren't saved either


@pytest.mark.parametrize("override", [
    {"exercises": []},
    {"therapy_type": "dance"},
    {"patient_email": "not-an-email"},
    {"patient_name": "   "},
    {"patient_dob": "not-a-date"},
    {"patient_dob": "2999-01-01"},
    {"exercises": [{"exercise_id": "squat", "sets": 0, "reps": 10, "target_rom": 90}]},
    {"exercises": [{"exercise_id": "squat", "sets": 3, "reps": 0, "target_rom": 90}]},
    {"exercises": [{"exercise_id": "squat", "sets": 3, "reps": 10, "target_rom": 90, "side": "middle"}]},
])
def test_malformed_plan_rejected(client, provider, override):
    assert client.post("/care-plans", json=plan_body(provider, **override)).status_code == 422
    assert_nothing_saved()


# --- Opening the plan from the QR handout ---

def test_matching_patient_claims_plan(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    patient = register_patient(client)
    r = claim(client, plan, patient)
    assert r.status_code == 200
    assert r.json()["patient_id"] == patient["patient_id"] and r.json()["status"] == "pending"
    [cp] = rows("care_plans")
    assert cp["patient_id"] == patient["patient_id"] and cp["claimed_at"] is not None

    mine = client.get(f"/patients/{patient['patient_id']}/care-plans").json()
    assert [(p["plan_id"], p["status"], p["exercise_count"]) for p in mine] == [(plan["plan_id"], "pending", 3)]


def test_claim_ignores_name_case_and_spacing(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    patient = register_patient(client, name="  margaret   CHEN ", email="MARGARET@example.com")
    assert claim(client, plan, patient).status_code == 200


@pytest.mark.parametrize("mismatch", [
    {"name": "Margaret Smith"},
    {"dob": "1952-03-15"},
    {"email": "someone-else@example.com"},
])
def test_mismatched_details_rejected(client, provider, mismatch):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    patient = register_patient(client, **mismatch)
    r = claim(client, plan, patient)
    assert r.status_code == 403 and "don't match" in r.json()["detail"]
    assert rows("care_plans")[0]["patient_id"] is None


def test_patient_without_dob_rejected(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    patient = client.post("/patients/register", json={"name": "Margaret Chen", "email": "margaret@example.com"}).json()
    r = claim(client, plan, patient)
    assert r.status_code == 403 and "date of birth" in r.json()["detail"]


def test_claim_is_single_patient(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    first = register_patient(client)
    assert claim(client, plan, first).status_code == 200
    assert claim(client, plan, first).status_code == 200  # scanning again is fine
    # emails are unique, so no second account can match exactly; make one match anyway to test the lock
    twin = register_patient(client, email="twin@example.com")
    db._execute("UPDATE care_plans SET assigned_email = 'twin@example.com'")
    r = claim(client, plan, twin)
    assert r.status_code == 403 and "another account" in r.json()["detail"]
    assert rows("care_plans")[0]["patient_id"] == first["patient_id"]


def test_invalid_token_rejected(client, provider):
    patient = register_patient(client)
    r = client.post("/care-plans/claim", json={"token": "made-up", "patient_id": patient["patient_id"]})
    assert r.status_code == 404


def test_expired_token_rejected(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    db._execute("UPDATE care_plans SET token_expires_at = now() - interval '1 day'")
    r = claim(client, plan, register_patient(client))
    assert r.status_code == 410


def test_new_join_token_replaces_old(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    r = client.post(f"/care-plans/{plan['plan_id']}/join-token", json={"provider_id": provider["provider_id"]})
    new_token = r.json()["join_token"]
    patient = register_patient(client)
    assert claim(client, plan, patient).status_code == 404  # old QR no longer works
    assert claim(client, {"join_token": new_token}, patient).status_code == 200


def test_only_owning_provider_can_make_new_token(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    other = client.post("/providers/register", json={"name": "Dr. Other", "email": "other@clinic.com"}).json()
    r = client.post(f"/care-plans/{plan['plan_id']}/join-token", json={"provider_id": other["provider_id"]})
    assert r.status_code == 404


# --- Reading a plan: owning provider or linked patient only ---

def test_plan_readable_by_owner_and_linked_patient_only(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    url = f"/care-plans/{plan['plan_id']}"
    patient = register_patient(client)
    assert client.get(url).status_code == 403
    assert client.get(url, params={"provider_id": provider["provider_id"]}).status_code == 200
    assert client.get(url, params={"patient_id": patient["patient_id"]}).status_code == 403  # not linked yet
    claim(client, plan, patient)
    r = client.get(url, params={"patient_id": patient["patient_id"]})
    assert r.status_code == 200 and "join_token" not in r.json() and "join_token_hash" not in r.json()


def test_unknown_plan_404(client):
    assert client.get("/care-plans/cp_missing").status_code == 404


# --- DB-level guarantees ---

def test_db_rejects_plan_for_missing_patient(client, provider):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db._execute("INSERT INTO care_plans (plan_id, patient_id, provider_id, created_at) "
                    "VALUES ('cp_x', 'p_missing', %s, now())", (provider["provider_id"],))


def test_db_requires_exactly_one_of_exercise_or_custom_name(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    with pytest.raises(psycopg.errors.CheckViolation):
        db._execute("INSERT INTO plan_exercises (plan_id, position, exercise_id, custom_name, sets, reps, target_rom) "
                    "VALUES (%s, 9, 'squat', 'Plank', 3, 10, 90)", (plan["plan_id"],))


def test_deleting_plan_deletes_its_exercises(client, provider):
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    db._execute("DELETE FROM care_plans WHERE plan_id = %s", (plan["plan_id"],))
    assert rows("plan_exercises") == []
