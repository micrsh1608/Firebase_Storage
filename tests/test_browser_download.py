"""Native download POSTs must enforce the same identity and sharing policy."""
from app.routes import auth_demo
from tests.test_files import PDF, api, headers, service, upload
from tests.test_files_phase2 import phase2_api, share


def test_owner_download_returns_attachment_and_current_name(api):
    client, _ = api
    item = upload(client).json()
    client.patch(f"/api/files/{item['name']}", json={"displayName": "Bài mới.pdf"}, headers=headers())
    path = f"/api/files/{item['name']}/download"
    response = client.post(path, data={"idToken": "alice"}, headers={"Origin": "http://127.0.0.1"})
    assert response.status_code == 200
    assert response.content == PDF
    assert response.headers["content-disposition"] == "attachment; filename*=UTF-8''B%C3%A0i%20m%E1%BB%9Bi.pdf"
    assert response.headers["content-length"] == str(len(PDF))
    assert response.headers["cache-control"] == "no-store"
    assert client.post(path, data={"idToken": "bob"}).status_code == 404
    assert client.post(path, data={}).status_code == 401
    assert client.post(path, data={"idToken": "alice"}, headers={"Origin": "https://other.example"}).status_code == 403
    assert client.post(path, data={"idToken": "alice"}, headers={"Origin": "null", "Sec-Fetch-Site": "same-origin"}).status_code == 200
    assert client.post(path, data={"idToken": "alice"}, headers={"Origin": "null", "Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.post(path, data={"idToken": "alice"}, headers={"Origin": "null"}).status_code == 403


def test_form_token_is_verified_and_not_read_from_query(api, monkeypatch):
    client, _ = api
    item = upload(client).json()
    path = f"/api/files/{item['name']}/download"
    assert client.post(path + "?idToken=alice", data={}).status_code == 401
    assert client.post(path, json={"idToken": "alice"}).status_code == 415
    assert client.post(path, data={"idToken": "x" * 20001}).status_code == 413
    assert client.post(path, data={"idToken": "x" * 16385}).status_code == 401
    assert client.post(path, content="idToken=alice&idToken=bob", headers={"content-type": "application/x-www-form-urlencoded"}).status_code == 401
    def invalid(*args, **kwargs):
        raise ValueError("invalid-test-token")
    monkeypatch.setattr(auth_demo.auth, "verify_id_token", invalid)
    response = client.post(path, data={"idToken": "invalid-test-token"})
    assert response.status_code == 401
    assert "invalid-test-token" not in response.text


def test_native_shared_download_rechecks_grant_and_trash(phase2_api):
    client, _, _, _ = phase2_api
    item = upload(client).json()
    path = f"/api/files/shared/alice/{item['name']}/download"
    assert client.post(path, data={"idToken": "bob"}).status_code == 404
    assert share(client, item["name"]).status_code == 201
    assert client.post(path, data={"idToken": "bob"}).content == PDF
    assert client.post(path, data={"idToken": "charlie"}).status_code == 404
    client.delete(f"/api/files/{item['name']}/shares/bob", headers=headers())
    assert client.post(path, data={"idToken": "bob"}).status_code == 404
    client.post(f"/api/files/{item['name']}/trash", headers=headers())
    assert client.post(f"/api/files/{item['name']}/download", data={"idToken": "alice"}).status_code == 404
