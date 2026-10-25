"""Durable sharing and trash lifecycle tests without cloud credentials or network."""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import threading
import time
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth

from app import main
from app.file_service import FileService, ServiceError, MAX_USER_BYTES
from app.routes import auth_demo
from tests.test_files import FakeBucket, FakeBlob, LOCAL, PDF, headers, upload


@pytest.fixture
def phase2_api(monkeypatch, tmp_path):
    bucket = FakeBucket()
    service = FileService(bucket, lock_dir=tmp_path / "locks", state_dir=tmp_path / "state")
    firebase_app = object()
    monkeypatch.setattr(main, "initialize_firebase", Mock(return_value=firebase_app))
    monkeypatch.setattr(main.firebase_admin, "delete_app", Mock())
    monkeypatch.setattr(auth_demo.auth, "verify_id_token",
                        lambda token, **kwargs: {"uid": token, "email": f"{token}@example.test"})
    recipients = {f"{uid}@example.test": SimpleNamespace(uid=uid, email=f"{uid}@example.test", disabled=False)
                  for uid in ["alice", "bob", "carol"] + [f"viewer{index}" for index in range(25)]}
    lookup = Mock()
    def resolve(email, **kwargs):
        record = recipients.get(email.lower())
        if record is None:
            raise auth.UserNotFoundError("Recipient does not exist")
        return record
    lookup.side_effect = resolve
    monkeypatch.setattr(auth, "get_user_by_email", lookup)
    application = main.create_app(LOCAL)
    application.state.file_service = service
    with TestClient(application, base_url="http://127.0.0.1") as client:
        yield client, service, lookup, tmp_path


def created(client, **kwargs):
    response = upload(client, **kwargs)
    assert response.status_code == 201, response.text
    return response.json()


def share(client, name, email="bob@example.test", uid="alice"):
    return client.post(f"/api/files/{name}/shares", json={"email": email}, headers=headers(uid))


def shared_path(item, owner="alice"):
    return f"/api/files/shared/{owner}/{item['name']}/content"


def assert_denied(operation, status=404):
    with pytest.raises(ServiceError) as error:
        operation()
    assert error.value.status_code == status


def test_share_to_registered_account_grants_download_only_and_lists_recipient(phase2_api):
    client, _, lookup, _ = phase2_api
    item = created(client)
    granted = share(client, item["name"])
    assert granted.status_code == 201, granted.text
    assert granted.json()["recipientUid"] == "bob"
    owner_shares = client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()
    assert len(owner_shares["shares"]) == 1
    assert owner_shares["shares"][0]["recipientUid"] == "bob"
    assert owner_shares["shares"][0]["email"] == "bob@example.test"
    shared = client.get("/api/files/shared-with-me", headers=headers("bob")).json()
    assert len(shared["files"]) == 1 and shared["files"][0]["name"] == item["name"]
    assert shared["files"][0]["ownerUid"] == "alice"
    assert shared["usage"]["usedBytes"] == 0  # Receiving a grant does not consume recipient storage.
    downloaded = client.get(shared_path(item), headers=headers("bob"))
    assert downloaded.status_code == 200 and downloaded.content == PDF
    assert "no-store" in downloaded.headers["Cache-Control"]
    assert "attachment" in downloaded.headers["Content-Disposition"]
    assert "token=" not in str(downloaded.headers)
    assert lookup.call_count == 1
    assert client.get(shared_path(item), headers=headers("carol")).status_code == 404
    assert client.get(shared_path(item)).status_code == 401
    assert client.get("/api/files/shared-with-me", headers=headers("carol")).json()["files"] == []


@pytest.mark.parametrize("method,suffix,body", [
    ("GET", "/shares", None), ("POST", "/shares", {"email": "carol@example.test"}),
    ("DELETE", "/shares/bob", None), ("POST", "/trash", None),
    ("POST", "/restore", None), ("DELETE", "", None),
], ids=["list-grants", "reshare", "revoke", "trash", "restore", "purge"])
def test_viewer_cannot_manage_owner_file_even_when_shared(phase2_api, method, suffix, body):
    client, _, _, _ = phase2_api
    item = created(client)
    assert share(client, item["name"]).status_code == 201
    response = client.request(method, f"/api/files/{item['name']}{suffix}", json=body, headers=headers("bob"))
    assert response.status_code == 404
    assert client.get(shared_path(item), headers=headers("bob")).status_code == 200


def test_guest_cannot_use_any_phase2_endpoint(phase2_api):
    client, _, _, _ = phase2_api
    for method, path in [("GET", "/api/files/trash"), ("GET", "/api/files/shared-with-me"),
                         ("GET", "/api/files/x.pdf/shares"), ("POST", "/api/files/x.pdf/shares"),
                         ("DELETE", "/api/files/x.pdf/shares/bob"), ("POST", "/api/files/x.pdf/trash"),
                         ("POST", "/api/files/x.pdf/restore"), ("GET", "/api/files/shared/alice/x.pdf/content")]:
        assert client.request(method, path, json={"email": "bob@example.test"}).status_code == 401


@pytest.mark.parametrize("email,status", [("alice@example.test", 400), ("not-an-email", 400),
                                          ("", 422), ("missing@example.test", 404)])
def test_invalid_unknown_and_self_recipient_are_rejected_without_grant(phase2_api, email, status):
    client, _, _, _ = phase2_api
    item = created(client)
    assert share(client, item["name"], email).status_code == status
    assert client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()["shares"] == []


def test_recipient_lookup_occurs_only_after_owner_access_is_confirmed(phase2_api):
    client, _, lookup, _ = phase2_api
    item = created(client)
    assert share(client, item["name"], "missing@example.test", uid="bob").status_code == 404
    lookup.assert_not_called()


def test_duplicate_grant_is_idempotent_and_twenty_recipient_limit_is_enforced(phase2_api):
    client, _, _, _ = phase2_api
    item = created(client)
    assert share(client, item["name"]).status_code == 201
    assert share(client, item["name"]).status_code == 201
    for index in range(19):
        response = share(client, item["name"], f"viewer{index}@example.test")
        assert response.status_code == 201, response.text
    grants = client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()["shares"]
    assert len(grants) == 20 and len({grant["recipientUid"] for grant in grants}) == 20
    assert share(client, item["name"], "viewer20@example.test").status_code == 409
    # An existing recipient remains idempotent even after capacity is reached.
    assert share(client, item["name"]).status_code == 201


def test_revocation_is_durable_and_blocks_fresh_download_after_service_restart(phase2_api):
    client, service, _, tmp_path = phase2_api
    item = created(client)
    assert share(client, item["name"]).status_code == 201
    reopened = FileService(service.bucket, lock_dir=tmp_path / "locks", state_dir=tmp_path / "state")
    assert reopened.shared_content("bob", "alice", item["name"])[0] == PDF
    response = client.delete(f"/api/files/{item['name']}/shares/bob", headers=headers())
    assert response.status_code == 204
    assert client.get(shared_path(item), headers=headers("bob")).status_code == 404
    assert client.get("/api/files/shared-with-me", headers=headers("bob")).json()["files"] == []
    restarted = FileService(service.bucket, lock_dir=tmp_path / "locks", state_dir=tmp_path / "state")
    assert_denied(lambda: restarted.shared_content("bob", "alice", item["name"]))
    assert restarted.shares("alice", item["name"])["shares"] == []


def test_trash_revokes_grants_retains_usage_and_restore_is_private(phase2_api):
    client, service, _, tmp_path = phase2_api
    item = created(client)
    assert share(client, item["name"]).status_code == 201
    before = client.get("/api/files", headers=headers()).json()["usage"]
    assert client.post(f"/api/files/{item['name']}/trash", headers=headers()).status_code == 204
    assert client.get("/api/files", headers=headers()).json()["files"] == []
    trash = client.get("/api/files/trash", headers=headers()).json()
    assert [file["name"] for file in trash["files"]] == [item["name"]]
    assert trash["usage"] == before
    assert client.get(f"/api/files/{item['name']}/content", headers=headers()).status_code == 404
    assert client.get(shared_path(item), headers=headers("bob")).status_code == 404
    assert client.get("/api/files/shared-with-me", headers=headers("bob")).json()["files"] == []
    assert share(client, item["name"]).status_code == 404
    assert item["fullPath"] in service.bucket.objects
    restarted = FileService(service.bucket, lock_dir=tmp_path / "locks", state_dir=tmp_path / "state")
    assert restarted.list_files("alice")["files"] == []
    assert restarted.list_trash("alice")["files"][0]["name"] == item["name"]
    assert client.post(f"/api/files/{item['name']}/restore", headers=headers()).status_code == 204
    assert client.get(f"/api/files/{item['name']}/content", headers=headers()).content == PDF
    assert client.get("/api/files/trash", headers=headers()).json()["files"] == []
    assert client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()["shares"] == []
    assert client.get(shared_path(item), headers=headers("bob")).status_code == 404


def test_permanent_delete_requires_trash_and_only_purge_releases_usage(phase2_api):
    client, service, _, _ = phase2_api
    item = created(client)
    assert client.delete(f"/api/files/{item['name']}", headers=headers()).status_code == 409
    assert client.get(f"/api/files/{item['name']}/content", headers=headers()).status_code == 200
    assert client.post(f"/api/files/{item['name']}/trash", headers=headers()).status_code == 204
    assert client.get("/api/files/trash", headers=headers()).json()["usage"]["usedBytes"] == len(PDF)
    assert client.delete(f"/api/files/{item['name']}", headers=headers()).status_code == 204
    assert item["fullPath"] not in service.bucket.objects
    listing = client.get("/api/files/trash", headers=headers()).json()
    assert listing["files"] == [] and listing["usage"]["usedBytes"] == 0
    assert listing["usage"]["fileCount"] == 0
    assert client.post(f"/api/files/{item['name']}/restore", headers=headers()).status_code == 404


def test_purge_storage_failure_preserves_trash_state_and_can_retry(phase2_api, monkeypatch):
    client, service, _, _ = phase2_api
    item = created(client)
    assert client.post(f"/api/files/{item['name']}/trash", headers=headers()).status_code == 204
    original_delete = FakeBlob.delete
    def failed_delete(self, **kwargs):
        raise RuntimeError("secret upstream credential path")
    monkeypatch.setattr(FakeBlob, "delete", failed_delete)
    failed = client.delete(f"/api/files/{item['name']}", headers=headers())
    assert failed.status_code == 503 and "secret" not in failed.text
    trash = client.get("/api/files/trash", headers=headers()).json()
    assert trash["files"][0]["name"] == item["name"]
    assert trash["usage"]["usedBytes"] == len(PDF)
    assert item["fullPath"] in service.bucket.objects
    monkeypatch.setattr(FakeBlob, "delete", original_delete)
    assert client.delete(f"/api/files/{item['name']}", headers=headers()).status_code == 204


def test_trash_does_not_make_account_capacity_available_for_upload(phase2_api):
    client, service, _, _ = phase2_api
    item = created(client)
    service.bucket.seed("users/alice/legacy.pdf", MAX_USER_BYTES - len(PDF))
    assert client.post(f"/api/files/{item['name']}/trash", headers=headers()).status_code == 204
    assert upload(client).status_code == 409
    assert client.delete(f"/api/files/{item['name']}", headers=headers()).status_code == 204
    assert upload(client).status_code == 201


def test_state_is_scoped_to_bucket_and_invalid_shared_paths_are_denied(phase2_api):
    client, service, _, tmp_path = phase2_api
    item = created(client)
    assert share(client, item["name"]).status_code == 201
    other_bucket = FakeBucket()
    other_bucket.name = "another-isolated-bucket"
    other_bucket.seed(item["fullPath"], len(PDF))
    other_service = FileService(other_bucket, lock_dir=tmp_path / "locks", state_dir=tmp_path / "state")
    assert other_service.list_shared("bob")["files"] == []
    assert_denied(lambda: other_service.shared_content("bob", "alice", item["name"]))
    for invalid in ["../bob", "alice/bob", "", None]:
        with pytest.raises(ServiceError):
            service.shared_content("bob", invalid, item["name"])
    for invalid in ["../x", "a/b", "a\\b", "..", "bad\x00name"]:
        with pytest.raises(ServiceError):
            service.shared_content("bob", "alice", invalid)


def test_inflight_download_may_finish_but_download_after_revoke_cannot(phase2_api, monkeypatch):
    client, service, _, _ = phase2_api
    item = created(client)
    assert share(client, item["name"]).status_code == 201
    entered, release = threading.Event(), threading.Event()
    original_download = FakeBlob.download_as_bytes
    def paused_download(self, **kwargs):
        entered.set()
        assert release.wait(5), "Test did not release in-flight download"
        return original_download(self, **kwargs)
    monkeypatch.setattr(FakeBlob, "download_as_bytes", paused_download)
    with ThreadPoolExecutor(max_workers=2) as pool:
        current = pool.submit(service.shared_content, "bob", "alice", item["name"])
        assert entered.wait(5)
        revoked = pool.submit(service.revoke_share, "alice", item["name"], "bob")
        time.sleep(0.02)
        release.set()
        assert current.result(timeout=5)[0] == PDF
        revoked.result(timeout=5)
    assert_denied(lambda: service.shared_content("bob", "alice", item["name"]))


def test_sharing_rejects_disabled_recipient_and_browser_supplied_uid(phase2_api):
    client, _, lookup, _ = phase2_api
    item = created(client)
    lookup.side_effect = None
    lookup.return_value = SimpleNamespace(uid="bob", email="bob@example.test", disabled=True)
    assert share(client, item["name"]).status_code == 404
    response = client.post(f"/api/files/{item['name']}/shares", headers=headers(),
                           json={"email": "bob@example.test", "recipientUid": "carol"})
    assert response.status_code == 422
    assert client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()["shares"] == []

@pytest.fixture
def cloud_phase2_api(monkeypatch, tmp_path):
    # Explicit cloud settings exercise the gate, while every Firebase operation
    # remains mocked and file bytes stay inside the fake bucket.
    from app.settings import Settings
    config = Settings("cloud", "test-project-not-a-live-resource", "public-web-key",
                      "test-project-not-a-live-resource.firebaseapp.com",
                      "test-project-not-a-live-resource.firebasestorage.app", "test-app-id")
    bucket = FakeBucket()
    service = FileService(bucket, lock_dir=tmp_path / "cloud-locks", state_dir=tmp_path / "cloud-state")
    monkeypatch.setattr(main, "initialize_firebase", Mock(return_value=object()))
    monkeypatch.setattr(main.firebase_admin, "delete_app", Mock())
    monkeypatch.setattr(auth_demo.auth, "verify_id_token",
                        lambda token, **kwargs: {"uid": token, "email": f"{token}@example.test"})
    lookup = Mock(return_value=SimpleNamespace(uid="bob", email="bob@example.test",
                                              email_verified=False, disabled=False))
    monkeypatch.setattr(auth, "get_user_by_email", lookup)
    application = main.create_app(config)
    application.state.file_service = service
    with TestClient(application, base_url="http://127.0.0.1") as client:
        yield client, service, lookup


def test_cloud_recipient_must_verify_email_before_grant_can_be_created(cloud_phase2_api):
    client, _, lookup = cloud_phase2_api
    item = created(client)
    rejected = share(client, item["name"])
    assert rejected.status_code == 409
    assert client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()["shares"] == []
    assert client.get(shared_path(item), headers=headers("bob")).status_code == 404
    # The recipient verifies through Firebase; retry uses the fresh server record.
    lookup.return_value.email_verified = True
    accepted = share(client, item["name"])
    assert accepted.status_code == 201
    assert accepted.json()["recipientUid"] == "bob"
    assert client.get(shared_path(item), headers=headers("bob")).status_code == 200
    assert lookup.call_count == 2


@pytest.mark.parametrize("forged_field", ["emailVerified", "email_verified"])
def test_cloud_browser_cannot_override_recipient_verification(cloud_phase2_api, forged_field):
    client, _, lookup = cloud_phase2_api
    item = created(client)
    forged = client.post(f"/api/files/{item['name']}/shares", headers=headers(),
                         json={"email": "bob@example.test", forged_field: True})
    assert forged.status_code == 422
    lookup.assert_not_called()
    assert share(client, item["name"]).status_code == 409
    assert client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()["shares"] == []


def test_cloud_checks_file_ownership_before_recipient_auth_lookup(cloud_phase2_api):
    client, _, lookup = cloud_phase2_api
    item = created(client)
    assert share(client, item["name"], uid="bob").status_code == 404
    lookup.assert_not_called()
    assert client.get(f"/api/files/{item['name']}/shares", headers=headers()).json()["shares"] == []
