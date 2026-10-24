"""Phase 1 tests: patient & provider registration/login (tables are independent)."""
import pytest

ROLES = [("patients", "patient_id", "p_"), ("providers", "provider_id", "pt_")]


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_register_returns_record(client, role, id_field, prefix):
    r = client.post(f"/{role}/register", json={"name": "Jane Doe", "email": "jane@example.com"})
    assert r.status_code == 200
    body = r.json()
    assert body[id_field].startswith(prefix)
    assert body["name"] == "Jane Doe"
    assert body["email"] == "jane@example.com"
    assert body["created_at"]


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_duplicate_email_rejected(client, role, id_field, prefix):
    payload = {"name": "Jane", "email": "jane@example.com"}
    assert client.post(f"/{role}/register", json=payload).status_code == 200
    r = client.post(f"/{role}/register", json={**payload, "name": "Someone Else"})
    assert r.status_code == 400
    assert len(client.get(f"/{role}").json()) == 1


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_login_existing_user(client, role, id_field, prefix):
    created = client.post(f"/{role}/register", json={"name": "Jane", "email": "jane@example.com"}).json()
    r = client.post(f"/{role}/login", json={"email": "jane@example.com"})
    assert r.status_code == 200
    assert r.json() == created


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_login_unknown_user_404(client, role, id_field, prefix):
    r = client.post(f"/{role}/login", json={"email": "nobody@example.com"})
    assert r.status_code == 404


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_list(client, role, id_field, prefix):
    assert client.get(f"/{role}").json() == []
    for i in range(3):
        client.post(f"/{role}/register", json={"name": f"User {i}", "email": f"u{i}@example.com"})
    rows = client.get(f"/{role}").json()
    assert len(rows) == 3
    assert len({row[id_field] for row in rows}) == 3


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
@pytest.mark.parametrize("payload", [{}, {"name": "Jane"}, {"email": "jane@example.com"}])
def test_register_missing_fields_422(client, role, id_field, prefix, payload):
    assert client.post(f"/{role}/register", json=payload).status_code == 422


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_login_missing_email_422(client, role, id_field, prefix):
    assert client.post(f"/{role}/login", json={}).status_code == 422


def test_patient_and_provider_tables_are_independent(client):
    """Same email can exist in both tables; logging into one role doesn't find the other."""
    payload = {"name": "Jane", "email": "jane@example.com"}
    assert client.post("/patients/register", json=payload).status_code == 200
    assert client.post("/providers/login", json={"email": "jane@example.com"}).status_code == 404
    assert client.post("/providers/register", json=payload).status_code == 200
    assert len(client.get("/patients").json()) == 1
    assert len(client.get("/providers").json()) == 1


# --- Input normalization & validation ---

@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_email_case_insensitive(client, role, id_field, prefix):
    created = client.post(f"/{role}/register", json={"name": "Jane", "email": "  Jane@Example.COM "}).json()
    assert created["email"] == "jane@example.com"
    assert client.post(f"/{role}/login", json={"email": "JANE@example.com"}).json() == created
    r = client.post(f"/{role}/register", json={"name": "Jane", "email": "jane@EXAMPLE.com"})
    assert r.status_code == 400


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
@pytest.mark.parametrize("email", ["not-an-email", "jane@", "@example.com", ""])
def test_invalid_email_rejected(client, role, id_field, prefix, email):
    assert client.post(f"/{role}/register", json={"name": "Jane", "email": email}).status_code == 422
    assert client.post(f"/{role}/login", json={"email": email}).status_code == 422


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
@pytest.mark.parametrize("name", ["", "   "])
def test_empty_name_rejected(client, role, id_field, prefix, name):
    assert client.post(f"/{role}/register", json={"name": name, "email": "jane@example.com"}).status_code == 422


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_name_is_trimmed(client, role, id_field, prefix):
    r = client.post(f"/{role}/register", json={"name": "  Jane Doe  ", "email": "jane@example.com"})
    assert r.json()["name"] == "Jane Doe"


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_concurrent_duplicate_returns_400(client, monkeypatch, role, id_field, prefix):
    """Simulate losing the race: the pre-check sees no user, but the insert hits the UNIQUE constraint."""
    import db
    client.post(f"/{role}/register", json={"name": "Jane", "email": "jane@example.com"})
    monkeypatch.setattr(db, f"login_{role[:-1]}", lambda email: None)
    r = client.post(f"/{role}/register", json={"name": "Jane", "email": "jane@example.com"})
    assert r.status_code == 400


# --- Patient age ---

def test_patient_age_optional_defaults_to_null(client):
    r = client.post("/patients/register", json={"name": "Jane", "email": "jane@example.com"})
    assert r.status_code == 200
    assert r.json()["age"] is None


def test_patient_age_saved(client):
    created = client.post("/patients/register", json={"name": "Jane", "email": "jane@example.com", "age": 72}).json()
    assert created["age"] == 72
    assert client.post("/patients/login", json={"email": "jane@example.com"}).json()["age"] == 72


@pytest.mark.parametrize("age", [-1, 121, "seventy"])
def test_patient_invalid_age_rejected(client, age):
    r = client.post("/patients/register", json={"name": "Jane", "email": "jane@example.com", "age": age})
    assert r.status_code == 422


def test_old_db_gets_age_column(client):
    """A patients table created before the age column existed is upgraded by init_db, keeping its rows."""
    import db
    db._execute("DROP TABLE patients CASCADE")  # care_plans references patients
    db._execute("""CREATE TABLE patients (patient_id TEXT PRIMARY KEY, name TEXT NOT NULL,
                                          email TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL)""")
    db._execute("INSERT INTO patients VALUES ('p_old', 'Old Row', 'old@example.com', '2026-01-01T00:00:00Z')")
    db.init_db()
    db.init_db()  # running it again is a no-op
    row = client.post("/patients/login", json={"email": "old@example.com"}).json()
    assert row["patient_id"] == "p_old"
    assert row["age"] is None
    assert row["sex_assigned_at_birth"] is None and row["gender_identity"] is None


# --- Patient sex assigned at birth & gender identity ---

def test_patient_sex_and_gender_optional(client):
    body = client.post("/patients/register", json={"name": "Jane", "email": "jane@example.com"}).json()
    assert body["sex_assigned_at_birth"] is None
    assert body["gender_identity"] is None


@pytest.mark.parametrize("sex", ["female", "male", "intersex", "prefer_not_to_say"])
def test_patient_sex_options_saved(client, sex):
    client.post("/patients/register", json={"name": "Jane", "email": "jane@example.com", "sex_assigned_at_birth": sex})
    assert client.post("/patients/login", json={"email": "jane@example.com"}).json()["sex_assigned_at_birth"] == sex


@pytest.mark.parametrize("sex", ["F", "other", ""])
def test_patient_invalid_sex_rejected(client, sex):
    r = client.post("/patients/register", json={"name": "Jane", "email": "jane@example.com", "sex_assigned_at_birth": sex})
    assert r.status_code == 422


@pytest.mark.parametrize("gender", ["Non-binary", "Transgender woman", "Two-Spirit", "demiboy (self-described)"])
def test_patient_gender_identity_free_text(client, gender):
    client.post("/patients/register", json={"name": "Sam", "email": "sam@example.com", "gender_identity": gender})
    assert client.post("/patients/login", json={"email": "sam@example.com"}).json()["gender_identity"] == gender


def test_patient_gender_identity_trimmed_and_blank_is_null(client):
    a = client.post("/patients/register", json={"name": "A", "email": "a@example.com", "gender_identity": "  Woman "}).json()
    b = client.post("/patients/register", json={"name": "B", "email": "b@example.com", "gender_identity": "   "}).json()
    assert a["gender_identity"] == "Woman"
    assert b["gender_identity"] is None


def test_patient_gender_identity_too_long_rejected(client):
    r = client.post("/patients/register", json={"name": "A", "email": "a@example.com", "gender_identity": "x" * 51})
    assert r.status_code == 422


# --- Direct DB checks: query the Postgres tables themselves, not just the API ---

def _rows(table):
    import db
    return db._fetchall(f"SELECT * FROM {table}")


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_registration_row_lands_in_table(client, role, id_field, prefix):
    created = client.post(f"/{role}/register", json={"name": "  Jane Doe ", "email": " Jane@Example.COM "}).json()
    rows = _rows(role)
    assert len(rows) == 1
    row = rows[0]
    assert row[id_field] == created[id_field]
    assert row["name"] == "Jane Doe"  # stored trimmed
    assert row["email"] == "jane@example.com"  # stored lowercased
    assert row["created_at"] is not None


def test_patient_details_land_in_table(client):
    client.post("/patients/register", json={"name": "Sam", "email": "sam@example.com", "age": 72,
                                            "sex_assigned_at_birth": "intersex", "gender_identity": "Non-binary"})
    row = _rows("patients")[0]
    assert (row["age"], row["sex_assigned_at_birth"], row["gender_identity"]) == (72, "intersex", "Non-binary")


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
@pytest.mark.parametrize("payload", [
    {"name": "Jane", "email": "not-an-email"},
    {"name": "", "email": "jane@example.com"},
    {"email": "jane@example.com"},
])
def test_rejected_registration_writes_nothing(client, role, id_field, prefix, payload):
    assert client.post(f"/{role}/register", json=payload).status_code == 422
    assert _rows(role) == []


@pytest.mark.parametrize("role,id_field,prefix", ROLES)
def test_duplicate_registration_keeps_original_row(client, role, id_field, prefix):
    client.post(f"/{role}/register", json={"name": "Original", "email": "jane@example.com"})
    client.post(f"/{role}/register", json={"name": "Impostor", "email": "JANE@example.com"})
    rows = _rows(role)
    assert len(rows) == 1 and rows[0]["name"] == "Original"


@pytest.mark.parametrize("column,value", [("age", 150), ("age", -1), ("sex_assigned_at_birth", "other")])
def test_db_constraints_reject_bad_values(client, column, value):
    """Even if something bypasses the API, Postgres itself refuses invalid patient data."""
    import psycopg
    import db
    with pytest.raises(psycopg.errors.CheckViolation):
        db._execute(f"INSERT INTO patients (patient_id, name, email, {column}, created_at) "
                    "VALUES ('p_x', 'X', 'x@example.com', %s, now())", (value,))
    assert _rows("patients") == []
