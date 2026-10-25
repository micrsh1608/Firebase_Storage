"""Extra offline contract tests for shared TV1/TV2 configuration and Admin app."""
from unittest.mock import Mock
from fastapi.testclient import TestClient
from app.settings import Settings
from app import main
from app.routes import auth_demo


def _cloud(*, enabled: bool):
    return Settings(
        mode="cloud",
        project_id="test-project-not-a-live-resource",
        api_key="public-web-key",
        auth_domain="test-project-not-a-live-resource.firebaseapp.com",
        bucket="test-project-not-a-live-resource.firebasestorage.app",
        app_id="1:123:web:demo",
        storage_check_enabled=enabled,
    )


def test_cloud_storage_and_auth_share_one_admin_app(monkeypatch):
    config = _cloud(enabled=True)
    fake_admin = object()
    initialize = Mock(return_value=fake_admin)
    probe = Mock(return_value=config.bucket)
    verify = Mock(return_value={"uid": "alice", "email": "alice@example.test"})
    delete = Mock()
    monkeypatch.setattr(main, "initialize_firebase", initialize)
    monkeypatch.setattr(main, "check_storage_access", probe)
    monkeypatch.setattr(main.firebase_admin, "delete_app", delete)
    monkeypatch.setattr(auth_demo.auth, "verify_id_token", verify)

    with TestClient(main.create_app(config), base_url="http://127.0.0.1") as client:
        status = client.get("/api/project-status").json()
        assert status["mode"] == "cloud"
        assert status["storage_enabled"] is True
        assert status["storage_configured"] is True
        assert client.get("/api/storage-check").json() == {
            "status": "ok", "bucket": config.bucket,
            "message": "Kết nối Cloud Storage thành công."
        }
        response = client.get("/api/auth/me", headers={"Authorization": "Bearer fake-test-token"})
        assert response.status_code == 200
        assert response.json()["uid"] == "alice"
        public = client.get("/api/demo-config").json()
        assert public == config.public_config()
        assert "credential" not in str(public).lower()
    initialize.assert_called_once_with(config)
    probe.assert_called_once_with(fake_admin, config.bucket)
    verify.assert_called_once_with("fake-test-token", app=fake_admin, check_revoked=True)
    delete.assert_called_once_with(fake_admin)


def test_cloud_admin_bucket_check_can_be_disabled_without_breaking_web_config(monkeypatch):
    config = _cloud(enabled=False)
    initialize = Mock(side_effect=AssertionError("Should not initialize Admin"))
    monkeypatch.setattr(main, "initialize_firebase", initialize)
    with TestClient(main.create_app(config), base_url="http://127.0.0.1") as client:
        response = client.get("/api/storage-check")
        assert response.status_code == 200
        assert response.json()["status"] == "disabled"
        assert client.get("/api/demo-config").json() == config.public_config()
    initialize.assert_not_called()
