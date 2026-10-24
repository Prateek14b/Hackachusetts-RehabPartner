"""Exercise library tests — landmark names must match MediaPipe exactly so the live webcam check
can look points up by name or index with no translation."""
import psycopg
import pytest

import db

# Verbatim from the PoseLandmark enum in google-ai-edge/mediapipe:
# mediapipe/python/solutions/pose.py (value = index in MediaPipe's landmark arrays)
MEDIAPIPE_POSE_LANDMARKS = {
    "NOSE": 0, "LEFT_EYE_INNER": 1, "LEFT_EYE": 2, "LEFT_EYE_OUTER": 3, "RIGHT_EYE_INNER": 4,
    "RIGHT_EYE": 5, "RIGHT_EYE_OUTER": 6, "LEFT_EAR": 7, "RIGHT_EAR": 8, "MOUTH_LEFT": 9,
    "MOUTH_RIGHT": 10, "LEFT_SHOULDER": 11, "RIGHT_SHOULDER": 12, "LEFT_ELBOW": 13, "RIGHT_ELBOW": 14,
    "LEFT_WRIST": 15, "RIGHT_WRIST": 16, "LEFT_PINKY": 17, "RIGHT_PINKY": 18, "LEFT_INDEX": 19,
    "RIGHT_INDEX": 20, "LEFT_THUMB": 21, "RIGHT_THUMB": 22, "LEFT_HIP": 23, "RIGHT_HIP": 24,
    "LEFT_KNEE": 25, "RIGHT_KNEE": 26, "LEFT_ANKLE": 27, "RIGHT_ANKLE": 28, "LEFT_HEEL": 29,
    "RIGHT_HEEL": 30, "LEFT_FOOT_INDEX": 31, "RIGHT_FOOT_INDEX": 32,
}

EXPECTED_EXERCISES = {"squat", "toe_touch", "shoulder_raise", "chair_stand", "seated_knee_extension"}


def test_shared_landmark_file_matches_mediapipe():
    names = db.load_shared("poseLandmarks.json")["landmarks"]
    assert {name: i for i, name in enumerate(names)} == MEDIAPIPE_POSE_LANDMARKS


def test_pose_landmarks_table_matches_mediapipe(client):
    rows = client.get("/pose-landmarks").json()
    assert {r["name"]: r["landmark_index"] for r in rows} == MEDIAPIPE_POSE_LANDMARKS


def test_exercises_seeded(client):
    exercises = client.get("/exercises").json()
    assert {e["exercise_id"] for e in exercises} == EXPECTED_EXERCISES
    for e in exercises:
        assert 0 <= e["min_rom"] < e["full_rom"]
        assert set(e["angle_points"]) == {"left", "right"}


def test_angle_points_use_mediapipe_names_and_indices(client):
    for e in client.get("/exercises").json():
        for side, p in e["angle_points"].items():
            for role in ("point_a", "vertex", "point_c"):
                name, index = p[f"{role}_landmark"], p[f"{role}_index"]
                assert MEDIAPIPE_POSE_LANDMARKS[name] == index, (e["exercise_id"], side, role)
                assert name.startswith(f"{side.upper()}_"), (e["exercise_id"], side, name)


def test_left_and_right_sides_mirror(client):
    for e in client.get("/exercises").json():
        left, right = e["angle_points"]["left"], e["angle_points"]["right"]
        for role in ("point_a", "vertex", "point_c"):
            assert left[f"{role}_landmark"].replace("LEFT_", "RIGHT_") == right[f"{role}_landmark"]


def test_squat_measures_knee_from_hip_and_ankle(client):
    squat = next(e for e in client.get("/exercises").json() if e["exercise_id"] == "squat")
    p = squat["angle_points"]["left"]
    assert (p["point_a_index"], p["vertex_index"], p["point_c_index"]) == (23, 25, 27)
    # knee bend shown to the PT = 180 - interior angle (standing straight = 0)
    assert (squat["angle_offset"], squat["angle_sign"]) == (180, -1)


def test_misspelled_landmark_rejected_by_db(client):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db._execute("UPDATE exercise_angle_points SET vertex_landmark = 'LEFT_KNEEE' "
                    "WHERE exercise_id = 'squat' AND side = 'left'")


def test_seeding_is_idempotent(client):
    db.init_db()
    db.init_db()
    assert len(client.get("/exercises").json()) == len(EXPECTED_EXERCISES)
    assert len(client.get("/pose-landmarks").json()) == 33
