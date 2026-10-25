"""Offline tests for TV1 pages; use explicit emulator settings, not the user's .env."""
import re
from fastapi.testclient import TestClient
from app.main import create_app
from app.settings import Settings

LOCAL = Settings("emulator", "demo-firebase-storage", "demo-api-key",
                 "demo-firebase-storage.firebaseapp.com",
                 "demo-firebase-storage.firebasestorage.app", "demo-app-id")
client = TestClient(create_app(LOCAL), base_url="http://127.0.0.1")


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_root_page():
    response = client.get("/")
    assert response.status_code == 200
    assert "Student File Hub" in response.text


def test_project_status():
    result = client.get("/api/project-status").json()
    assert result["mode"] == "emulator"
    assert result["firebase_project_id"] == "demo-firebase-storage"
    assert result["storage_enabled"] is False


def test_emulator_status_is_explicit():
    response = client.get("/api/storage-check")
    assert response.status_code == 200
    assert response.json()["status"] == "emulator"


def test_homepage_references_working_static_entrypoints():
    response = client.get("/")
    assert response.status_code == 200
    assert re.search(r'href="/static/styles\.css(?:\?[^\"]*)?"', response.text)
    assert re.search(r'src="/static/ui\.js(?:\?[^\"]*)?"', response.text)
    for name in ("styles.css", "ui.js", "firebase-client.js", "auth.js", "storage.js", "file-policy.js"):
        asset = client.get(f"/static/{name}")
        assert asset.status_code == 200, name
        assert "<!doctype html>" not in asset.text.lower(), name
    assert client.get("/static/not-a-real-module.js").status_code == 404


def test_setup_page_and_single_source_web_config():
    response = client.get("/setup")
    assert response.status_code == 200
    assert "Student File Hub" in response.text
    assert "/api/project-status" in response.text
    assert "/api/storage-check" in response.text
    assert client.get("/static/firebase-config.js").status_code == 404
    assert client.get("/api/demo-config").status_code == 200
