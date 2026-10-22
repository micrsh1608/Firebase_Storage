"""Offline HTTP/config contract tests. Admin verification is mocked here.

Real Auth/Storage/Rules proof lives in emulator.integration.test.js.
"""
import importlib
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import GoogleAuthError

from app.settings import Settings


LOCAL = Settings("emulator", "demo-firebase-storage", "demo-api-key",
                 "demo-firebase-storage.firebaseapp.com",
                 "demo-firebase-storage.firebasestorage.app", "demo-app-id")
ENV_KEYS = ("DEMO_MODE", "FIREBASE_PROJECT_ID", "FIREBASE_WEB_API_KEY", "FIREBASE_AUTH_DOMAIN",
            "FIREBASE_STORAGE_BUCKET", "FIREBASE_APP_ID", "FIREBASE_AUTH_EMULATOR_HOST",
            "FIREBASE_STORAGE_EMULATOR_HOST")


@pytest.fixture
def isolated_env(monkeypatch):
    # Ignore the developer's .env and inherited cloud/emulator settings.
    monkeypatch.setattr("app.settings.load_dotenv", lambda *args, **kwargs: None)
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


@pytest.fixture
def api(isolated_env):
    main = importlib.import_module("app.main")
    auth_demo = importlib.import_module("app.routes.auth_demo")
    firebase_app = object()
    initialize = Mock(return_value=firebase_app)
    cleanup = Mock()
    verifier = Mock(side_effect=AssertionError("Unexpected real token verification"))
    isolated_env.setattr(main, "initialize_firebase", initialize)
    isolated_env.setattr(main.firebase_admin, "delete_app", cleanup)
    isolated_env.setattr(auth_demo.auth, "verify_id_token", verifier)
    application = main.create_app(LOCAL)
    with TestClient(application, base_url="http://127.0.0.1") as client:
        yield client, verifier, firebase_app, initialize
        was_initialized = application.state.firebase_app is firebase_app
    if was_initialized:
        initialize.assert_called_once_with(LOCAL)
        cleanup.assert_called_once_with(firebase_app)
    else:
        cleanup.assert_not_called()


def test_public_config_and_health_do_not_leak_credentials(api, isolated_env):
    client, verifier, _, initialize = api
    isolated_env.setenv("GOOGLE_APPLICATION_CREDENTIALS", "secret-service-account-path.json")
    response = client.get("/api/demo-config")
    assert response.status_code == 200
    assert response.json() == LOCAL.public_config()
    assert set(response.json()["firebaseConfig"]) == {"apiKey", "authDomain", "projectId", "storageBucket", "appId"}
    assert "secret-service-account" not in response.text
    assert "private_key" not in response.text
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert client.get("/health").json() == {"status": "ok", "mode": "emulator"}
    verifier.assert_not_called()
    initialize.assert_not_called()


@pytest.mark.parametrize("authorization", [None, "Basic abc", "Bearer " + "x" * 16385])
def test_missing_wrong_scheme_and_oversized_token_return_401(api, authorization):
    client, verifier, _, initialize = api
    headers = {"Authorization": authorization} if authorization else {}
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    verifier.assert_not_called()
    initialize.assert_not_called()


def test_invalid_token_is_401_without_echoing_token(api):
    client, verifier, firebase_app, _ = api
    verifier.side_effect = ValueError("sensitive-token-material")
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid-test-token"})
    assert response.status_code == 401
    assert "invalid-test-token" not in response.text
    assert "sensitive-token-material" not in response.text
    verifier.assert_called_once_with("invalid-test-token", app=firebase_app, check_revoked=True)


def test_success_returns_only_verified_identity(api):
    client, verifier, firebase_app, _ = api
    verifier.side_effect = None
    verifier.return_value = {"uid": "verified-alice", "email": "alice@example.test", "email_verified": True,
                             "extra_claim": "not-public", "token": "never-echo-this"}
    response = client.get("/api/auth/me?uid=forged-bob", headers={"Authorization": "Bearer test-id-token"})
    assert response.status_code == 200
    assert response.json() == {"uid": "verified-alice", "email": "alice@example.test", "emailVerified": True}
    assert "test-id-token" not in response.text and "never-echo-this" not in response.text
    verifier.assert_called_once_with("test-id-token", app=firebase_app, check_revoked=True)


def test_verification_outage_is_503_instead_of_invalid_login(api):
    client, verifier, _, _ = api
    verifier.side_effect = GoogleAuthError("internal-credential-detail")
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer test-id-token"})
    assert response.status_code == 503
    assert "internal-credential-detail" not in response.text


def test_local_server_rejects_external_host(api):
    client, verifier, _, initialize = api
    assert client.get("/api/demo-config", headers={"Host": "untrusted.example"}).status_code == 400
    verifier.assert_not_called()
    initialize.assert_not_called()


def test_firebase_initialization_is_cached_across_authenticated_requests(api):
    client, verifier, firebase_app, initialize = api
    verifier.side_effect = None
    verifier.return_value = {"uid": "verified-alice"}
    for token in ("first-test-token", "second-test-token"):
        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json()["uid"] == "verified-alice"
    initialize.assert_called_once_with(LOCAL)
    assert verifier.call_count == 2
    assert all(call.kwargs["app"] is firebase_app for call in verifier.call_args_list)


def test_project_status_uses_the_active_application_config(api, isolated_env):
    client, verifier, _, initialize = api
    isolated_env.setenv("FIREBASE_PROJECT_ID", "unrelated-production-project")
    isolated_env.setenv("STORAGE_ENABLED", "false")
    response = client.get("/api/project-status")
    assert response.status_code == 200
    assert response.json()["firebase_project_id"] == LOCAL.project_id
    assert response.json()["mode"] == "emulator"
    verifier.assert_not_called()
    initialize.assert_not_called()


def test_emulator_storage_check_never_probes_the_cloud_bucket(api, isolated_env):
    client, verifier, _, initialize = api
    main = importlib.import_module("app.main")
    cloud_probe = Mock(side_effect=AssertionError("Unexpected cloud bucket access"))
    isolated_env.setattr(main, "check_storage_access", cloud_probe)
    isolated_env.setenv("STORAGE_ENABLED", "true")
    response = client.get("/api/storage-check")
    assert response.status_code == 200
    assert response.json()["status"] == "emulator"
    assert response.json()["bucket"] == LOCAL.bucket
    cloud_probe.assert_not_called()
    verifier.assert_not_called()
    initialize.assert_not_called()


@pytest.mark.parametrize("initialization_error", [GoogleAuthError, ValueError])
def test_cloud_pages_start_without_adc_but_backend_auth_reports_503(isolated_env, initialization_error):
    main = importlib.import_module("app.main")
    auth_demo = importlib.import_module("app.routes.auth_demo")
    cloud = Settings("cloud", "real-project", "public-key", "real.firebaseapp.com",
                     "real.firebasestorage.app", "app-id")
    initialize = Mock(side_effect=initialization_error("secret-ADC-path-and-private-details"))
    verifier = Mock(side_effect=AssertionError("Verifier must not run without an Admin app"))
    cleanup = Mock()
    isolated_env.setattr(main, "initialize_firebase", initialize)
    isolated_env.setattr(main.firebase_admin, "delete_app", cleanup)
    isolated_env.setattr(auth_demo.auth, "verify_id_token", verifier)
    with TestClient(main.create_app(cloud), base_url="http://127.0.0.1") as client:
        for path in ("/", "/setup", "/health", "/api/health", "/api/demo-config"):
            assert client.get(path).status_code == 200
        assert client.get("/api/demo-config").json() == cloud.public_config()
        assert client.get("/api/auth/me").status_code == 401
        initialize.assert_not_called()
        response = client.get("/api/auth/me", headers={"Authorization": "Bearer test-id-token"})
        assert response.status_code == 503
        assert "secret-ADC-path" not in response.text
        assert "test-id-token" not in response.text
        initialize.assert_called_once_with(cloud)
        verifier.assert_not_called()
    cleanup.assert_not_called()


def test_emulator_defaults_require_matching_demo_project(isolated_env):
    assert Settings.from_env() == LOCAL
    isolated_env.setenv("FIREBASE_PROJECT_ID", "some-production-project")
    with pytest.raises(ValueError, match="demo-firebase-storage"):
        Settings.from_env()


def test_cloud_refuses_missing_config_and_demo_project(isolated_env):
    isolated_env.setenv("DEMO_MODE", "cloud")
    with pytest.raises(ValueError, match="Missing cloud configuration"):
        Settings.from_env()
    for key, value in {"FIREBASE_PROJECT_ID": "demo-firebase-storage", "FIREBASE_WEB_API_KEY": "public-key",
                       "FIREBASE_AUTH_DOMAIN": "real.firebaseapp.com", "FIREBASE_STORAGE_BUCKET": "real.firebasestorage.app",
                       "FIREBASE_APP_ID": "1:123:web:abc"}.items():
        isolated_env.setenv(key, value)
    with pytest.raises(ValueError, match="real Firebase project"):
        Settings.from_env()


@pytest.mark.parametrize("variable", ["FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"])
def test_cloud_rejects_emulator_environment_before_credentials_or_network(isolated_env, variable):
    from app.firebase_admin_client import initialize_firebase
    isolated_env.setenv("DEMO_MODE", "cloud")
    isolated_env.setenv(variable, "127.0.0.1:9099")
    with pytest.raises(ValueError, match="refuses emulator"):
        Settings.from_env()
    cloud = Settings("cloud", "real-project", "public-key", "real.firebaseapp.com", "real.firebasestorage.app", "app-id")
    with pytest.raises(ValueError, match="never be enabled in cloud"):
        initialize_firebase(cloud)
