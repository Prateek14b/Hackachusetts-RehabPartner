"""Camera consent and exercise sessions: results are saved per plan exercise and personal bests are tracked."""
import pytest

import db


@pytest.fixture
def linked(client):
    """A provider, a plan (squat 3x10 @ 90°, wall push-up 2x12), and the patient it's linked to."""
    provider = client.post("/providers/register", json={"name": "Dr. Sarah", "email": "sarah@clinic.com"}).json()
    plan = client.post("/care-plans", json={
        "provider_id": provider["provider_id"], "patient_name": "Margaret Chen", "patient_dob": "1952-03-14",
        "patient_email": "margaret@example.com",
        "exercises": [{"exercise_id": "squat", "sets": 3, "reps": 10, "target_rom": 90},
                      {"custom_name": "Wall push-up", "sets": 2, "reps": 12}]}).json()
    patient = client.post("/patients/register", json={"name": "Margaret Chen", "email": "margaret@example.com",
                                                       "dob": "1952-03-14"}).json()
    client.post("/care-plans/claim", json={"token": plan["join_token"], "patient_id": patient["patient_id"]})
    return client, provider, plan, patient


def session_body(patient, exercises, start="2026-10-25T10:00:00Z", end="2026-10-25T10:20:00Z"):
    return {"patient_id": patient["patient_id"], "started_at": start, "ended_at": end, "exercises": exercises}


FULL = [{"position": 0, "sets_completed": 3, "reps_completed": 30, "reps_at_target": 25, "peak_rom": 95, "pain": 2},
        {"position": 1, "sets_completed": 2, "reps_completed": 24, "reps_at_target": 0, "pain": 1}]


# --- Consent ---

def test_consent_recorded(linked):
    client, _, plan, patient = linked
    url = f"/care-plans/{plan['plan_id']}/consent"
    assert client.get(url, params={"patient_id": patient["patient_id"]}).json() == {"consent": None}
    r = client.post(url, json={"patient_id": patient["patient_id"], "version": "2026-10"})
    assert r.status_code == 200 and r.json()["kind"] == "camera"
    consent = client.get(url, params={"patient_id": patient["patient_id"]}).json()["consent"]
    assert consent["version"] == "2026-10" and consent["agreed_at"]


def test_consent_requires_linked_patient(linked):
    client, _, plan, _ = linked
    other = client.post("/patients/register", json={"name": "X", "email": "x@example.com", "dob": "1990-01-01"}).json()
    r = client.post(f"/care-plans/{plan['plan_id']}/consent", json={"patient_id": other["patient_id"], "version": "v"})
    assert r.status_code == 403
    assert db._fetchall("SELECT * FROM consents") == []


# --- Saving sessions ---

def test_full_session_saved_and_plan_becomes_active(linked):
    client, _, plan, patient = linked
    r = client.post(f"/care-plans/{plan['plan_id']}/sessions", json=session_body(patient, FULL))
    assert r.status_code == 200
    s = r.json()
    assert s["completed"] is True
    assert [(e["name"], e["sets_completed"], e["reps_completed"], e["peak_rom"], e["target_rom"], e["new_best"])
            for e in s["exercises"]] == [("Squat", 3, 30, 95, 90, True), ("Wall push-up", 2, 24, None, None, False)]
    assert db._fetchone("SELECT status FROM care_plans")["status"] == "active"
    assert len(db._fetchall("SELECT * FROM session_exercises")) == 2


def test_done_for_the_day_saves_partial_session(linked):
    client, _, plan, patient = linked
    partial = [{"position": 0, "sets_completed": 1, "reps_completed": 12, "reps_at_target": 8, "peak_rom": 80}]
    s = client.post(f"/care-plans/{plan['plan_id']}/sessions", json=session_body(patient, partial)).json()
    assert s["completed"] is False
    # the exercise not attempted is still recorded, as zero
    assert [(e["position"], e["sets_completed"], e["reps_completed"]) for e in s["exercises"]] == [(0, 1, 12), (1, 0, 0)]


def test_personal_bests_tracked_across_sessions(linked):
    client, provider, plan, patient = linked
    url = f"/care-plans/{plan['plan_id']}/sessions"
    for day, peak in [(25, 70), (26, 85), (27, 80)]:
        ex = [{"position": 0, "sets_completed": 3, "reps_completed": 30, "reps_at_target": 0, "peak_rom": peak}]
        client.post(url, json=session_body(patient, ex, f"2026-10-{day}T10:00:00Z", f"2026-10-{day}T10:20:00Z"))
    progress = client.get(f"/care-plans/{plan['plan_id']}/progress", params={"provider_id": provider["provider_id"]})
    p = progress.json()
    assert p["bests"]["0"]["best_rom"] == 85
    assert [s["exercises"][0]["new_best"] for s in p["sessions"]] == [False, True, True]  # newest first
    assert p["plan"]["assigned_name"] == "Margaret Chen"


def test_progress_access(linked):
    client, provider, plan, patient = linked
    url = f"/care-plans/{plan['plan_id']}/progress"
    assert client.get(url, params={"patient_id": patient["patient_id"]}).status_code == 200
    assert client.get(url, params={"provider_id": provider["provider_id"]}).status_code == 200
    assert client.get(url, params={"provider_id": "pt_other"}).status_code == 403
    assert client.get(url).status_code == 403


@pytest.mark.parametrize("exercises,message", [
    ([{"position": 5, "sets_completed": 1, "reps_completed": 1, "reps_at_target": 0}], "isn't part of this plan"),
    ([{"position": 0, "sets_completed": 4, "reps_completed": 30, "reps_at_target": 0}], "more sets or reps"),
    ([{"position": 0, "sets_completed": 3, "reps_completed": 31, "reps_at_target": 0}], "more sets or reps"),
    ([{"position": 0, "sets_completed": 1, "reps_completed": 5, "reps_at_target": 6}], "more reps at target"),
    ([{"position": 1, "sets_completed": 1, "reps_completed": 5, "reps_at_target": 0, "peak_rom": 40}],
     "isn't camera-tracked"),
    ([{"position": 0, "sets_completed": 1, "reps_completed": 5, "reps_at_target": 0, "peak_rom": 400}],
     "isn't plausible"),
    (FULL + [FULL[0]], "reported twice"),
])
def test_invalid_session_rejected(linked, exercises, message):
    client, _, plan, patient = linked
    r = client.post(f"/care-plans/{plan['plan_id']}/sessions", json=session_body(patient, exercises))
    assert r.status_code == 400 and message in r.json()["detail"]
    assert db._fetchall("SELECT * FROM sessions") == []


def test_session_end_before_start_rejected(linked):
    client, _, plan, patient = linked
    body = session_body(patient, FULL, start="2026-10-25T11:00:00Z", end="2026-10-25T10:00:00Z")
    assert client.post(f"/care-plans/{plan['plan_id']}/sessions", json=body).status_code == 400


def test_pain_out_of_range_rejected(linked):
    client, _, plan, patient = linked
    bad = [{**FULL[0], "pain": 11}]
    assert client.post(f"/care-plans/{plan['plan_id']}/sessions", json=session_body(patient, bad)).status_code == 422


def test_unlinked_patient_cannot_save(linked):
    client, _, plan, _ = linked
    other = client.post("/patients/register", json={"name": "X", "email": "x@example.com", "dob": "1990-01-01"}).json()
    r = client.post(f"/care-plans/{plan['plan_id']}/sessions", json=session_body(other, FULL))
    assert r.status_code == 403
