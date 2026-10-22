from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, base_url="http://127.0.0.1")


def test_health_without_blaze():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_root_page():
    response = client.get("/")
    assert response.status_code == 200
    assert "Student File Hub" in response.text


def test_project_status(monkeypatch):
    monkeypatch.setenv("STORAGE_ENABLED", "false")
    response = client.get("/api/project-status")
    assert response.status_code == 200
    assert response.json()["storage_enabled"] is False


def test_storage_safely_deferred(monkeypatch):
    monkeypatch.setenv("STORAGE_ENABLED", "false")
    response = client.get("/api/storage-check")
    assert response.status_code == 200
    assert response.json()["status"] == "pending_blaze"


def test_homepage_references_working_static_entrypoints():
    response = client.get("/")
    assert response.status_code == 200
    assert 'href="/static/styles.css"' in response.text
    assert 'src="/static/ui.js"' in response.text
    # Include all modules reached by UI imports, not just the two HTML links.
    for name in ("styles.css", "ui.js", "firebase-client.js", "auth.js", "storage.js", "file-policy.js"):
        asset = client.get(f"/static/{name}")
        assert asset.status_code == 200, name
        assert "<!doctype html>" not in asset.text.lower(), name
    assert client.get("/static/not-a-real-module.js").status_code == 404


def test_member1_setup_page_and_original_public_config_are_retained():
    response = client.get("/setup")
    assert response.status_code == 200
    assert "Student File Hub" in response.text
    assert "/api/project-status" in response.text
    assert "/api/storage-check" in response.text
    assert client.get("/static/firebase-config.js").status_code == 200
