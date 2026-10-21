from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


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
