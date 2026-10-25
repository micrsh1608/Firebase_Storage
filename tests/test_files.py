"""Phase 1 behavior tests. Bucket is isolated; real cross-service proof is in JS integration."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import threading
import time
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from google.api_core.exceptions import NotFound, PreconditionFailed

from app import main
from app.file_service import FileService, ServiceError, MAX_FILE_BYTES, MAX_USER_BYTES, MAX_USER_FILES
from app.routes import auth_demo
from app.settings import Settings

PDF = b"%PDF-1.7\n"
PNG = b"\x89PNG\r\n\x1a\nimage-data"
LOCAL = Settings("emulator", "demo-firebase-storage", "demo-api-key",
                 "demo-firebase-storage.firebaseapp.com",
                 "demo-firebase-storage.firebasestorage.app", "demo-app-id")


class FakeBlob:
    def __init__(self, bucket, name):
        self.bucket, self.name = bucket, name
        self.size, self.data, self.content_type = 0, b"", None
        self.updated, self.generation = datetime.now(timezone.utc), 1
        self.metadata, self.cache_control = {}, None

    def upload_from_string(self, data, *, content_type, if_generation_match, timeout):
        assert if_generation_match == 0 and timeout > 0
        # Make overlapping uploads likely if the service forgets to lock its quota check.
        time.sleep(self.bucket.upload_delay)
        with self.bucket.mutex:
            if self.bucket.fail_upload:
                raise RuntimeError("credential-path-and-secret-upstream-error")
            if self.name in self.bucket.objects:
                raise PreconditionFailed("existing generation")
            self.data, self.size, self.content_type = bytes(data), len(data), content_type
            self.bucket.objects[self.name] = self

    def reload(self, *, timeout):
        with self.bucket.mutex:
            if self.name not in self.bucket.objects:
                raise NotFound("missing")
            other = self.bucket.objects[self.name]
            if other is not self:
                self.__dict__.update(other.__dict__)

    def download_as_bytes(self, *, if_generation_match, timeout):
        self.reload(timeout=timeout)
        if if_generation_match != self.generation:
            raise PreconditionFailed("changed")
        return self.data

    def delete(self, *, if_generation_match, timeout):
        with self.bucket.mutex:
            if self.name not in self.bucket.objects:
                raise NotFound("missing")
            if if_generation_match != self.bucket.objects[self.name].generation:
                raise PreconditionFailed("changed")
            del self.bucket.objects[self.name]


class FakeBucket:
    name = "isolated-test-bucket"

    def __init__(self):
        self.objects = {}
        self.mutex = threading.RLock()
        self.fail_upload = False
        self.upload_delay = 0

    def blob(self, name):
        return FakeBlob(self, name)

    def list_blobs(self, *, prefix, timeout):
        with self.mutex:
            return [blob for name, blob in self.objects.items() if name.startswith(prefix)]

    def seed(self, name, size, data=PDF):
        blob = FakeBlob(self, name)
        blob.size, blob.data, blob.content_type = size, data, "application/pdf"
        self.objects[name] = blob
        return blob


@pytest.fixture
def service(tmp_path):
    return FileService(FakeBucket(), lock_dir=tmp_path / "locks", state_dir=tmp_path / "state")


@pytest.fixture
def api(monkeypatch, service):
    fake_app = object()
    monkeypatch.setattr(main, "initialize_firebase", Mock(return_value=fake_app))
    monkeypatch.setattr(main.firebase_admin, "delete_app", Mock())
    monkeypatch.setattr(auth_demo.auth, "verify_id_token", lambda token, **kwargs: {"uid": token})
    application = main.create_app(LOCAL)
    application.state.file_service = service
    with TestClient(application, base_url="http://127.0.0.1") as client:
        yield client, service


def headers(uid="alice", content_type=None):
    result = {"Authorization": f"Bearer {uid}"}
    if content_type is not None:
        result["Content-Type"] = content_type
    return result


def upload(client, data=PDF, *, uid="alice", name="bài tập.pdf", content_type="application/pdf"):
    return client.put("/api/files", params={"name": name}, content=data, headers=headers(uid, content_type))


def test_owner_lifecycle_and_other_user_isolation(api):
    client, service = api
    created = upload(client)
    assert created.status_code == 201, created.text
    item = created.json()
    assert item["fullPath"] == "users/alice/" + item["name"]
    assert item["size"] == len(PDF)
    assert item["contentType"] == "application/pdf"
    stored = service.bucket.objects[item["fullPath"]]
    assert stored.metadata == {"originalName": "bài tập.pdf"}
    assert "firebaseStorageDownloadTokens" not in stored.metadata
    assert stored.cache_control == "private, max-age=0, no-store"
    listing = client.get("/api/files", headers=headers()).json()
    assert listing["files"] == [{**item, "shareCount": 0}]
    assert listing["usage"] == {"usedBytes": len(PDF), "maxBytes": MAX_USER_BYTES, "maxFileBytes": MAX_FILE_BYTES, "fileCount": 1, "maxFiles": MAX_USER_FILES}
    # Browser-supplied owner fields cannot change the verified owner.
    other = client.get("/api/files?uid=alice", headers=headers("bob")).json()
    assert other["files"] == [] and other["usage"]["usedBytes"] == 0
    path = "/api/files/" + item["name"]
    own_download = client.get(path + "/content", headers=headers())
    assert own_download.status_code == 200 and own_download.content == PDF
    assert "attachment" in own_download.headers["Content-Disposition"]
    assert "no-store" in own_download.headers["Cache-Control"]
    assert "token=" not in str(own_download.headers)
    assert client.get(path + "/content", headers=headers("bob")).status_code == 404
    assert client.delete(path, headers=headers("bob")).status_code == 404
    assert client.post(path + "/trash", headers=headers()).status_code == 204
    assert client.delete(path, headers=headers()).status_code == 204
    assert client.get(path + "/content", headers=headers()).status_code == 404
    assert client.get("/api/files", headers=headers()).json()["usage"]["usedBytes"] == 0


@pytest.mark.parametrize("method,path", [("GET", "/api/files"), ("PUT", "/api/files?name=a.pdf"),
                                          ("GET", "/api/files/a.pdf/content"), ("DELETE", "/api/files/a.pdf")])
def test_all_file_operations_require_token(api, method, path):
    client, service = api
    result = client.request(method, path)
    assert result.status_code == 401
    assert result.headers["WWW-Authenticate"] == "Bearer"
    assert not service.bucket.objects


@pytest.mark.parametrize("data,content_type,status", [(b"", "application/pdf", 400),
    (PDF, "text/html", 415), (PNG, "application/pdf", 415), (PDF, "image/png", 415),
    (PDF + bytes(MAX_FILE_BYTES), "application/pdf", 413)], ids=["empty", "type", "pdf-signature", "png-signature", "oversized"])
def test_invalid_upload_is_rejected_by_server_without_changing_usage(api, data, content_type, status):
    client, service = api
    response = upload(client, data, content_type=content_type)
    assert response.status_code == status
    assert not service.bucket.objects


def test_actual_streamed_bytes_enforce_limit_even_with_false_content_length(api):
    client, service = api
    response = client.put("/api/files?name=chunked.pdf", content=iter([PDF, bytes(MAX_FILE_BYTES)]),
                          headers={**headers(content_type="application/pdf"), "Content-Length": "1"})
    assert response.status_code == 413
    assert not service.bucket.objects


@pytest.mark.parametrize("content_length", ["-1", "invalid", str(MAX_FILE_BYTES + 1)])
def test_rejects_invalid_or_excessive_declared_length(api, content_length):
    client, service = api
    result = client.put("/api/files?name=x.pdf", content=PDF,
                        headers={**headers(content_type="application/pdf"), "Content-Length": content_length})
    assert result.status_code == (413 if content_length == str(MAX_FILE_BYTES + 1) else 400)
    assert not service.bucket.objects


def test_upload_at_exact_file_limit_is_accepted_and_original_name_cannot_escape_prefix(api):
    client, _ = api
    body = PDF + bytes(MAX_FILE_BYTES - len(PDF))
    result = upload(client, body, name="../../秘密<bài>.pdf")
    assert result.status_code == 201
    item = result.json()
    assert item["size"] == MAX_FILE_BYTES
    assert item["fullPath"].startswith("users/alice/")
    assert "/" not in item["name"] and "\\" not in item["name"]
    assert ".." not in item["name"] and "<" not in item["name"]


def test_invalid_verified_uid_and_path_segments_are_rejected(service):
    for uid in ["../bob", "alice/bob", "", None]:
        with pytest.raises(ServiceError) as failure:
            service.list_files(uid)
        assert failure.value.status_code == 401
    for name in ["../secret", "a/b", "a\\b", "..", ".", "bad\x00name"]:
        for method in [service.content, service.delete]:
            with pytest.raises(ServiceError) as failure:
                method("alice", name)
            assert failure.value.status_code == 400


def test_quota_includes_hidden_legacy_files_and_deletion_frees_space(api):
    client, service = api
    legacy = service.bucket.seed("users/alice/nested/old.pdf", MAX_USER_BYTES - len(PDF))
    service.bucket.seed("users/alice-other/ignored.pdf", MAX_USER_BYTES)
    first = upload(client)
    assert first.status_code == 201
    second = upload(client)
    assert second.status_code == 409
    listing = client.get("/api/files", headers=headers()).json()
    assert len(listing["files"]) == 1
    assert listing["usage"]["usedBytes"] == MAX_USER_BYTES
    assert client.post("/api/files/" + first.json()["name"] + "/trash", headers=headers()).status_code == 204
    assert client.delete("/api/files/" + first.json()["name"], headers=headers()).status_code == 204
    assert upload(client).status_code == 201
    assert legacy.name in service.bucket.objects


def test_two_service_instances_share_account_lock_and_cannot_overrun_quota(tmp_path):
    bucket = FakeBucket()
    bucket.seed("users/alice/existing.pdf", MAX_USER_BYTES - len(PDF))
    bucket.upload_delay = 0.05
    services = [FileService(bucket, lock_dir=tmp_path, state_dir=tmp_path / "state"), FileService(bucket, lock_dir=tmp_path, state_dir=tmp_path / "state")]
    def attempt(service):
        try:
            return service.upload("alice", PDF, "race.pdf", "application/pdf")
        except ServiceError as error:
            return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, services))
    assert sum(isinstance(result, dict) for result in results) == 1
    assert results.count(409) == 1
    assert sum(blob.size for blob in bucket.objects.values()) == MAX_USER_BYTES


def test_failed_upload_is_safe_and_lock_is_released_for_retry(api):
    client, service = api
    service.bucket.fail_upload = True
    failure = upload(client)
    assert failure.status_code == 503
    assert "credential-path" not in failure.text and "secret-upstream" not in failure.text
    assert not service.bucket.objects
    service.bucket.fail_upload = False
    assert upload(client).status_code == 201


def test_listing_pagination_usage_and_bad_cursor(api):
    client, service = api
    for index in range(21):
        service.bucket.seed(f"users/alice/{index:03}.pdf", len(PDF))
    first = client.get("/api/files", headers=headers()).json()
    assert len(first["files"]) == 20 and first["nextPageToken"]
    second = client.get("/api/files", params={"pageToken": first["nextPageToken"]}, headers=headers()).json()
    assert len(second["files"]) == 1 and second["nextPageToken"] is None
    assert {file["name"] for file in first["files"]}.isdisjoint(file["name"] for file in second["files"])
    assert first["usage"] == second["usage"]
    assert first["usage"]["usedBytes"] == 21 * len(PDF)
    for value in ["not-base64!", "Li4vYm9i"]:
        assert client.get("/api/files", params={"pageToken": value}, headers=headers()).status_code == 400



def test_file_count_limit_prevents_tiny_file_resource_exhaustion(api):
    client, service = api
    for index in range(MAX_USER_FILES):
        service.bucket.seed(f"users/alice/{index:03}.pdf", len(PDF))
    response = upload(client)
    assert response.status_code == 409
    listing = client.get("/api/files", headers=headers()).json()
    assert listing["usage"]["fileCount"] == MAX_USER_FILES
    assert listing["usage"]["maxFiles"] == MAX_USER_FILES
    assert client.post("/api/files/000.pdf/trash", headers=headers()).status_code == 204
    assert client.delete("/api/files/000.pdf", headers=headers()).status_code == 204
    assert upload(client).status_code == 201

def test_standalone_emulator_initialization_sets_google_storage_endpoint(monkeypatch):
    import os
    from app import firebase_admin_client
    for key in ("FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST"):
        monkeypatch.delenv(key, raising=False)
    sentinel = object()
    initialize = Mock(return_value=sentinel)
    monkeypatch.setattr(firebase_admin_client.firebase_admin, "initialize_app", initialize)
    assert firebase_admin_client.initialize_firebase(LOCAL) is sentinel
    assert os.environ["FIREBASE_AUTH_EMULATOR_HOST"] == "127.0.0.1:9099"
    assert os.environ["FIREBASE_STORAGE_EMULATOR_HOST"] == "127.0.0.1:9199"
    assert os.environ["STORAGE_EMULATOR_HOST"] == "http://127.0.0.1:9199"
    initialize.assert_called_once()
    credential, options = initialize.call_args.args
    assert isinstance(credential, firebase_admin_client._EmulatorCredential)
    assert options == {"projectId": LOCAL.project_id, "storageBucket": LOCAL.bucket}
    assert initialize.call_args.kwargs["name"] == "student-file-hub"

