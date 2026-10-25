"""Phase 3 folders, global queries, inline preview and legacy metadata migration."""
from datetime import datetime, timedelta, timezone
import hashlib
import sqlite3

import pytest

from app.file_service import FileService, ServiceError
from tests.test_files import PDF, PNG, FakeBucket, headers, upload
from tests.test_files_phase2 import phase2_api, created, share, shared_path


def create_folder(client, name, parent=None, uid="alice"):
    response = client.post("/api/folders", headers=headers(uid), json={"name": name, "parentId": parent})
    assert response.status_code == 201, response.text
    return response.json()


def list_files(client, uid="alice", **query):
    response = client.get("/api/files", headers=headers(uid), params=query)
    assert response.status_code == 200, response.text
    return response.json()


def test_folder_tree_breadcrumbs_and_account_isolation(phase2_api):
    client, _, _, _ = phase2_api
    parent = create_folder(client, "Kỳ học")
    child = create_folder(client, "Tài liệu", parent["id"])
    root = client.get("/api/folders", headers=headers()).json()
    assert [folder["id"] for folder in root["folders"]] == [parent["id"]]
    nested = client.get("/api/folders", headers=headers(), params={"parentId": child["id"]}).json()
    assert nested["folders"] == []
    assert [(crumb["id"], crumb["name"]) for crumb in nested["breadcrumbs"]] == [(parent["id"], "Kỳ học"), (child["id"], "Tài liệu")]
    assert client.get("/api/folders", headers=headers("bob")).json()["folders"] == []
    assert client.get("/api/folders", headers=headers("bob"), params={"parentId": parent["id"]}).status_code == 404
    for method, body in [("PATCH", {"name": "stolen"}), ("DELETE", None)]:
        assert client.request(method, f"/api/folders/{parent['id']}", headers=headers("bob"), json=body).status_code == 404
    assert client.post("/api/folders", headers=headers("bob"), json={"name": "child", "parentId": parent["id"]}).status_code == 404


def test_folder_rename_move_cycles_and_casefold_sibling_uniqueness(phase2_api):
    client, _, _, _ = phase2_api
    a = create_folder(client, "BÀI TẬP")
    b = create_folder(client, "Đồ án")
    child = create_folder(client, "Tuần 1", a["id"])
    assert client.post("/api/folders", headers=headers(), json={"name": "bài tập"}).status_code == 409
    assert client.post("/api/folders", headers=headers(), json={"name": "BA\u0300I TẬP"}).status_code == 409
    # The same visible name is allowed under a different parent.
    create_folder(client, "Tuần 1", b["id"])
    assert client.patch(f"/api/folders/{a['id']}", headers=headers(), json={"parentId": a["id"]}).status_code == 409
    assert client.patch(f"/api/folders/{a['id']}", headers=headers(), json={"parentId": child["id"]}).status_code == 409
    assert client.patch(f"/api/folders/{child['id']}", headers=headers(), json={"parentId": b["id"]}).status_code == 409
    changed = client.patch(f"/api/folders/{child['id']}", headers=headers(), json={"name": "Tuần 2", "parentId": b["id"]})
    assert changed.status_code == 200 and changed.json()["parentId"] == b["id"]
    crumbs = client.get("/api/folders", headers=headers(), params={"parentId": child["id"]}).json()["breadcrumbs"]
    assert [crumb["name"] for crumb in crumbs] == ["Đồ án", "Tuần 2"]


def test_folder_depth_and_account_folder_count_limits(phase2_api):
    client, _, _, _ = phase2_api
    parent = None
    for depth in range(10):
        parent = create_folder(client, f"Cấp {depth + 1}", parent)["id"]
    assert client.post("/api/folders", headers=headers(), json={"name": "Cấp 11", "parentId": parent}).status_code == 409
    for index in range(90):
        create_folder(client, f"Folder {index}")
    assert client.post("/api/folders", headers=headers(), json={"name": "Folder 101"}).status_code == 409
    all_folders = client.get("/api/folders", headers=headers(), params={"all": "true"}).json()["folders"]
    assert len(all_folders) == 100
    root_empty = next(folder for folder in all_folders if folder["name"] == "Folder 0")
    assert client.delete(f"/api/folders/{root_empty['id']}", headers=headers()).status_code == 204
    create_folder(client, "Slot available again")


@pytest.mark.parametrize("name", ["", ".", "..", "../outside", "a\\b", "line\nfeed", "x" * 121])
def test_folder_names_reject_path_and_control_characters(phase2_api, name):
    client, _, _, _ = phase2_api
    response = client.post("/api/folders", headers=headers(), json={"name": name})
    assert response.status_code in {400, 422}
    assert client.get("/api/folders", headers=headers()).json()["folders"] == []


def test_empty_folder_delete_checks_children_active_and_trashed_file_references(phase2_api):
    client, _, _, _ = phase2_api
    parent = create_folder(client, "Tài liệu")
    child = create_folder(client, "Con", parent["id"])
    path = f"/api/folders/{parent['id']}"
    assert client.delete(path, headers=headers()).status_code == 409
    assert client.delete(f"/api/folders/{child['id']}", headers=headers()).status_code == 204
    uploaded = client.put("/api/files", params={"name": "bài.pdf", "folderId": parent["id"]},
                          headers=headers(content_type="application/pdf"), content=PDF)
    assert uploaded.status_code == 201
    item = uploaded.json()
    assert item["folderId"] == parent["id"]
    assert client.delete(path, headers=headers()).status_code == 409
    assert client.post(f"/api/files/{item['name']}/trash", headers=headers()).status_code == 204
    assert client.delete(path, headers=headers()).status_code == 409
    assert client.delete(f"/api/files/{item['name']}", headers=headers()).status_code == 204
    assert client.delete(path, headers=headers()).status_code == 204


def test_file_rename_move_preserves_storage_identity_grants_and_quota_across_restart(phase2_api):
    client, service, _, tmp_path = phase2_api
    item = created(client)
    folder = create_folder(client, "Môn học")
    assert share(client, item["name"]).status_code == 201
    before = list_files(client)["usage"]
    original_objects = set(service.bucket.objects)
    changed = client.patch(f"/api/files/{item['name']}", headers=headers(),
                           json={"displayName": "Báo cáo mới.pdf", "folderId": folder["id"]})
    assert changed.status_code == 200, changed.text
    updated = changed.json()
    assert updated["name"] == item["name"] and updated["fullPath"] == item["fullPath"]
    assert updated["displayName"] == "Báo cáo mới.pdf" and updated["folderId"] == folder["id"]
    assert set(service.bucket.objects) == original_objects
    assert list_files(client)["usage"] == before
    folder_view = list_files(client, scope="folder", folderId=folder["id"])
    assert folder_view["total"] == 1 and folder_view["files"][0]["name"] == item["name"]
    assert list_files(client, scope="folder")["files"] == []
    downloaded = client.get(shared_path(item), headers=headers("bob"))
    assert downloaded.status_code == 200 and downloaded.content == PDF
    from urllib.parse import unquote
    assert "Báo cáo mới.pdf" in unquote(downloaded.headers["Content-Disposition"])
    restarted = FileService(service.bucket, lock_dir=tmp_path / "locks", state_dir=tmp_path / "state")
    assert restarted.list_files("alice")["files"][0]["displayName"] == "Báo cáo mới.pdf"
    assert restarted.shared_content("bob", "alice", item["name"])[0] == PDF
    assert client.patch(f"/api/files/{item['name']}", headers=headers(), json={"folderId": None}).status_code == 200
    assert list_files(client, scope="folder")["total"] == 1


def test_viewer_cannot_rename_move_or_manage_owner_folder(phase2_api):
    client, _, _, _ = phase2_api
    item = created(client)
    folder = create_folder(client, "Chỉ của A")
    own_bob = created(client, uid="bob")
    assert share(client, item["name"]).status_code == 201
    assert client.patch(f"/api/files/{item['name']}", headers=headers("bob"), json={"displayName": "stolen.pdf"}).status_code == 404
    assert client.patch(f"/api/files/{item['name']}", headers=headers("bob"), json={"folderId": folder["id"]}).status_code == 404
    assert client.patch(f"/api/files/{own_bob['name']}", headers=headers("bob"), json={"folderId": folder["id"]}).status_code == 404
    assert client.patch(f"/api/folders/{folder['id']}", headers=headers("bob"), json={"name": "stolen"}).status_code == 404
    assert client.get(shared_path(item), headers=headers("bob")).status_code == 200


def test_global_name_search_finds_match_beyond_first_twenty_without_foreign_leak(phase2_api):
    client, service, _, _ = phase2_api
    for index in range(45):
        service.bucket.seed(f"users/alice/{index:03}-ordinary.pdf", len(PDF))
    service.bucket.seed("users/alice/999-BÀI TẬP needle.pdf", len(PDF))
    service.bucket.seed("users/bob/999-needle-secret.pdf", len(PDF))
    first = list_files(client)
    assert first["total"] == 46 and len(first["files"]) == 20
    assert not any("needle" in file["name"] for file in first["files"])
    result = list_files(client, q="bài tập NEEDLE")
    assert result["total"] == 1 and result["nextPageToken"] is None
    assert result["files"][0]["fullPath"] == "users/alice/999-BÀI TẬP needle.pdf"


def test_type_filter_and_sort_are_applied_before_pagination(phase2_api):
    client, service, _, _ = phase2_api
    for index in range(25):
        blob = service.bucket.seed(f"users/alice/pdf-{index:02}.pdf", index + 1)
        blob.updated = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=index)
    for index in range(2):
        blob = service.bucket.seed(f"users/alice/zzz-image-{index}.png", 100 + index, PNG)
        blob.content_type = "image/png"
    images = list_files(client, type="image", sort="size")
    assert images["total"] == 2 and [file["size"] for file in images["files"]] == [101, 100]
    first = list_files(client, type="pdf", sort="size")
    assert first["total"] == 25 and [file["size"] for file in first["files"]] == list(range(25, 5, -1))
    second = list_files(client, type="pdf", sort="size", pageToken=first["nextPageToken"])
    assert [file["size"] for file in second["files"]] == [5, 4, 3, 2, 1]
    newest = list_files(client, type="pdf", sort="newest")
    oldest = list_files(client, type="pdf", sort="oldest")
    assert newest["files"][0]["name"] == "pdf-24.pdf"
    assert oldest["files"][0]["name"] == "pdf-00.pdf"


def test_global_shared_and_trash_queries_filter_authorized_set_before_pagination(phase2_api):
    client, service, _, _ = phase2_api
    names = []
    for index in range(24):
        name = f"{index:03}-ordinary.pdf"
        service.bucket.seed(f"users/alice/{name}", len(PDF))
        names.append(name)
    service.bucket.seed("users/alice/999-needle.pdf", len(PDF))
    names.append("999-needle.pdf")
    for name in names:
        assert share(client, name).status_code == 201
    result = client.get("/api/files/shared-with-me", headers=headers("bob"), params={"q": "needle", "type": "pdf"}).json()
    assert result["total"] == 1 and result["files"][0]["name"] == "999-needle.pdf"
    assert client.get("/api/files/shared-with-me", headers=headers("carol"), params={"q": "needle"}).json()["total"] == 0
    for name in names:
        assert client.post(f"/api/files/{name}/trash", headers=headers()).status_code == 204
    result = client.get("/api/files/trash", headers=headers(), params={"q": "needle", "type": "pdf", "sort": "size"}).json()
    assert result["total"] == 1 and result["files"][0]["name"] == "999-needle.pdf"
    assert result["usage"]["fileCount"] == 25
    assert client.get("/api/files/shared-with-me", headers=headers("bob"), params={"q": "needle"}).json()["total"] == 0


def test_cursor_is_bound_to_query_view_folder_and_identity(phase2_api):
    client, service, _, _ = phase2_api
    for index in range(25):
        service.bucket.seed(f"users/alice/{index:03}.pdf", len(PDF))
    first = list_files(client)
    token = first["nextPageToken"]
    assert token
    for changed in [{"q": "00"}, {"type": "pdf"}, {"sort": "size"}, {"scope": "folder"}]:
        response = client.get("/api/files", headers=headers(), params={"pageToken": token, **changed})
        assert response.status_code == 400
    assert client.get("/api/files", headers=headers("bob"), params={"pageToken": token}).status_code == 400
    assert client.get("/api/files/trash", headers=headers(), params={"pageToken": token}).status_code == 400
    assert client.get("/api/files/shared-with-me", headers=headers(), params={"pageToken": token}).status_code == 400
    assert client.get("/api/files", headers=headers(), params={"pageToken": "tampered!"}).status_code == 400


@pytest.mark.parametrize("data,mime,extension", [(PDF, "application/pdf", "pdf"), (PNG, "image/png", "png")], ids=["pdf", "image"])
def test_inline_preview_uses_download_acl_and_defensive_headers(phase2_api, data, mime, extension):
    client, _, _, _ = phase2_api
    item = created(client, data=data, content_type=mime, name=f"preview.{extension}")
    path = f"/api/files/{item['name']}/preview"
    own = client.get(path, headers=headers())
    assert own.status_code == 200 and own.content == data
    assert own.headers["Content-Type"].split(";", 1)[0] == mime
    assert own.headers["Content-Disposition"].startswith("inline;")
    assert "sandbox" in own.headers["Content-Security-Policy"]
    assert own.headers["X-Content-Type-Options"] == "nosniff"
    assert "no-store" in own.headers["Cache-Control"] and "token=" not in str(own.headers)
    assert client.get(path, headers=headers("bob")).status_code == 404
    assert client.get(path).status_code == 401
    assert share(client, item["name"]).status_code == 201
    shared_preview = f"/api/files/shared/alice/{item['name']}/preview"
    assert client.get(shared_preview, headers=headers("bob")).content == data
    assert client.get(shared_preview, headers=headers("carol")).status_code == 404
    assert client.delete(f"/api/files/{item['name']}/shares/bob", headers=headers()).status_code == 204
    assert client.get(shared_preview, headers=headers("bob")).status_code == 404
    assert share(client, item["name"]).status_code == 201
    assert client.post(f"/api/files/{item['name']}/trash", headers=headers()).status_code == 204
    assert client.get(path, headers=headers()).status_code == 404
    assert client.get(shared_preview, headers=headers("bob")).status_code == 404


def test_legacy_sqlite_schema_migrates_preserving_grants_trash_and_restart(tmp_path):
    bucket = FakeBucket()
    bucket.seed("users/alice/legacy.pdf", len(PDF))
    bucket.seed("users/alice/trashed.pdf", len(PDF))
    state_dir = tmp_path / "legacy-state"
    state_dir.mkdir()
    path = state_dir / (hashlib.sha256(bucket.name.encode()).hexdigest() + ".sqlite3")
    with sqlite3.connect(path) as connection:
        connection.executescript("""
            CREATE TABLE files(owner_uid TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,trashed_at TEXT,PRIMARY KEY(owner_uid,name));
            CREATE TABLE shares(owner_uid TEXT NOT NULL,name TEXT NOT NULL,recipient_uid TEXT NOT NULL,email TEXT NOT NULL,owner_email TEXT,created_at TEXT NOT NULL,PRIMARY KEY(owner_uid,name,recipient_uid));
            INSERT INTO files VALUES('alice','legacy.pdf','active',NULL);
            INSERT INTO files VALUES('alice','trashed.pdf','trash','2026-01-01T00:00:00Z');
            INSERT INTO shares VALUES('alice','legacy.pdf','bob','bob@example.test','alice@example.test','2026-01-01T00:00:00Z');
        """)
    service = FileService(bucket, lock_dir=tmp_path / "locks", state_dir=state_dir)
    active = service.list_files("alice")["files"]
    assert len(active) == 1 and active[0]["name"] == "legacy.pdf"
    assert active[0]["folderId"] is None
    assert service.shared_content("bob", "alice", "legacy.pdf")[0] == PDF
    assert service.list_trash("alice")["files"][0]["name"] == "trashed.pdf"
    with pytest.raises(ServiceError) as denied:
        service.content("alice", "trashed.pdf")
    assert denied.value.status_code == 404
    service.update_file("alice", "legacy.pdf", {"displayName": "Tên mới.pdf"})
    restarted = FileService(bucket, lock_dir=tmp_path / "locks", state_dir=state_dir)
    assert restarted.list_files("alice")["files"][0]["displayName"] == "Tên mới.pdf"
    assert restarted.shared_content("bob", "alice", "legacy.pdf")[0] == PDF
    assert restarted.list_trash("alice")["files"][0]["name"] == "trashed.pdf"


def test_moving_folder_subtree_checks_deepest_descendant_depth(phase2_api):
    client, _, _, _ = phase2_api
    deepest = None
    for index in range(9):
        deepest = create_folder(client, f"Depth {index + 1}", deepest)["id"]
    subtree = create_folder(client, "Subtree")
    create_folder(client, "Subtree child", subtree["id"])
    rejected = client.patch(f"/api/folders/{subtree['id']}", headers=headers(), json={"parentId": deepest})
    assert rejected.status_code == 409
    leaf = create_folder(client, "Movable leaf")
    assert client.patch(f"/api/folders/{leaf['id']}", headers=headers(), json={"parentId": deepest}).status_code == 200
    breadcrumbs = client.get("/api/folders", headers=headers(), params={"parentId": leaf["id"]}).json()["breadcrumbs"]
    assert len(breadcrumbs) == 10
