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
