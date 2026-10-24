"""Care plan tests — saving a plan writes care_plans + plan_exercises, linked to an existing patient."""
import psycopg
import pytest

import db


@pytest.fixture
def setup(client):
    provider = client.post("/providers/register", json={"name": "Dr. Sarah", "email": "sarah@clinic.com"}).json()
    patient = client.post("/patients/register", json={"name": "Margaret", "email": "margaret@example.com"}).json()
    return client, provider, patient


def plan_body(provider, **overrides):
    body = {
        "provider_id": provider["provider_id"],
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


def rows(table):
    return db._fetchall(f"SELECT * FROM {table}")


def test_save_plan_writes_tables(setup):
    client, provider, patient = setup
    r = client.post("/care-plans", json=plan_body(provider))
    assert r.status_code == 200
    plan = r.json()

    [cp] = rows("care_plans")
    assert cp["plan_id"] == plan["plan_id"] and cp["plan_id"].startswith("cp_")
    assert (cp["patient_id"], cp["provider_id"], cp["therapy_type"]) == (
        patient["patient_id"], provider["provider_id"], "orthopedic")

    pe = db._fetchall("SELECT * FROM plan_exercises ORDER BY position")
    assert [(r["position"], r["exercise_id"], r["custom_name"], r["sets"], r["reps"], r["target_rom"], r["side"])
            for r in pe] == [
        (0, "squat", None, 3, 10, 90, "both"),
        (1, None, "Wall push-up", 2, 12, None, "both"),
        (2, "shoulder_raise", None, 3, 8, 150, "left"),
    ]
    assert all(r["plan_id"] == plan["plan_id"] for r in pe)


def test_saved_plan_returned_with_names_in_order(setup):
    client, provider, _ = setup
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    assert plan["patient_name"] == "Margaret"
    assert [e["name"] for e in plan["exercises"]] == ["Squat", "Wall push-up", "Shoulder raise (forward)"]
    assert client.get(f"/care-plans/{plan['plan_id']}").json() == plan


def test_patient_email_matched_case_insensitively(setup):
    client, provider, patient = setup
    plan = client.post("/care-plans", json=plan_body(provider, patient_email=" Margaret@EXAMPLE.com ")).json()
    assert plan["patient_id"] == patient["patient_id"]


def test_list_plans_for_provider(setup):
    client, provider, _ = setup
    other = client.post("/providers/register", json={"name": "Dr. Other", "email": "other@clinic.com"}).json()
    client.post("/care-plans", json=plan_body(provider))
    client.post("/care-plans", json=plan_body(other))
    mine = client.get("/care-plans", params={"provider_id": provider["provider_id"]}).json()
    assert len(mine) == 1
    assert mine[0]["patient_name"] == "Margaret" and mine[0]["exercise_count"] == 3


def test_therapy_type_optional(setup):
    client, provider, _ = setup
    r = client.post("/care-plans", json=plan_body(provider, therapy_type=None))
    assert r.status_code == 200 and r.json()["therapy_type"] is None


# --- Rejections: nothing is written ---

def assert_nothing_saved():
    assert rows("care_plans") == [] and rows("plan_exercises") == []


def test_unregistered_patient_rejected(setup):
    client, provider, _ = setup
    r = client.post("/care-plans", json=plan_body(provider, patient_email="nobody@example.com"))
    assert r.status_code == 404 and "sign up first" in r.json()["detail"]
    assert_nothing_saved()


def test_unknown_provider_rejected(setup):
    client, provider, _ = setup
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
def test_invalid_exercise_row_rejected(setup, exercise, message):
    client, provider, _ = setup
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
    {"exercises": [{"exercise_id": "squat", "sets": 0, "reps": 10, "target_rom": 90}]},
    {"exercises": [{"exercise_id": "squat", "sets": 3, "reps": 0, "target_rom": 90}]},
    {"exercises": [{"exercise_id": "squat", "sets": 3, "reps": 10, "target_rom": 90, "side": "middle"}]},
])
def test_malformed_plan_rejected(setup, override):
    client, provider, _ = setup
    assert client.post("/care-plans", json=plan_body(provider, **override)).status_code == 422
    assert_nothing_saved()


def test_unknown_plan_404(client):
    assert client.get("/care-plans/cp_missing").status_code == 404


# --- DB-level guarantees ---

def test_db_rejects_plan_for_missing_patient(setup):
    _, provider, _ = setup
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db._execute("INSERT INTO care_plans VALUES ('cp_x', 'p_missing', %s, NULL, now())",
                    (provider["provider_id"],))


def test_db_requires_exactly_one_of_exercise_or_custom_name(setup):
    client, provider, _ = setup
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    with pytest.raises(psycopg.errors.CheckViolation):
        db._execute("INSERT INTO plan_exercises (plan_id, position, exercise_id, custom_name, sets, reps, target_rom) "
                    "VALUES (%s, 9, 'squat', 'Plank', 3, 10, 90)", (plan["plan_id"],))


def test_deleting_plan_deletes_its_exercises(setup):
    client, provider, _ = setup
    plan = client.post("/care-plans", json=plan_body(provider)).json()
    db._execute("DELETE FROM care_plans WHERE plan_id = %s", (plan["plan_id"],))
    assert rows("plan_exercises") == []
