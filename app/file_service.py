"""Private file gateway with an authoritative, process-safe per-account quota.

The browser never supplies an owner or a usage counter. Storage Rules deny client
file access; this adapter uses Admin credentials only after API authentication.
Lock SQLite files coordinate processes on one deployment filesystem. Separate
durable SQLite metadata records trash and grants. Usage comes from Storage.
"""
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import sqlite3
import unicodedata
from pathlib import Path
from uuid import UUID, uuid4

from google.api_core.exceptions import NotFound, PreconditionFailed

from app.settings import ROOT
from app.file_state import FileState

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_USER_BYTES = 50 * 1024 * 1024
MAX_USER_FILES = 200
MAX_SHARES_PER_FILE = 20
MAX_FOLDERS = 100
MAX_FOLDER_DEPTH = 10
PAGE_SIZE = 20
ALLOWED_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "application/pdf"})
STORAGE_TIMEOUT = 30


class ServiceError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def validate_uid(uid: str) -> str:
    if not isinstance(uid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", uid):
        raise ServiceError(401, "Tài khoản không hợp lệ.")
    return uid


def validate_leaf(name: str) -> str:
    if (not isinstance(name, str) or not name or len(name) > 240
            or name in {".", ".."} or any(c in name for c in "/\\")
            or any(ord(c) < 32 or ord(c) == 127 for c in name)):
        raise ServiceError(400, "Tên file không hợp lệ.")
    return name


def safe_file_name(name: str) -> str:
    if not isinstance(name, str) or not name or len(name) > 1024:
        raise ServiceError(400, "Tên file không hợp lệ.")
    name = unicodedata.normalize("NFC", name)
    safe = "".join(c if c.isalnum() or c in "._ -" else "_" for c in name)
    safe = re.sub(r"\.{2,}", "_", safe).strip(". ")[:120]
    return safe or "file"


def validate_display_name(value):
    if not isinstance(value, str):
        raise ServiceError(400, "Tên phải là văn bản.")
    value = unicodedata.normalize("NFC", value).strip()
    if (not 1 <= len(value) <= 120 or value in {".", ".."}
            or any(c in value for c in "/\\")
            or any(unicodedata.category(c).startswith("C") for c in value)):
        raise ServiceError(400, "Tên cần 1–120 ký tự, không chứa dấu phân cách đường dẫn hoặc ký tự điều khiển.")
    return value


def validate_folder_id(value):
    if value is None:
        return None
    try:
        if not isinstance(value, str) or str(UUID(value)) != value.lower():
            raise ValueError
    except (ValueError, AttributeError, TypeError):
        raise ServiceError(400, "Mã thư mục không hợp lệ.") from None
    return value.lower()


def validate_upload(data: bytes, content_type: str):
    if content_type not in ALLOWED_TYPES:
        raise ServiceError(415, "Chỉ nhận JPEG, PNG, WebP hoặc PDF.")
    if not data:
        raise ServiceError(400, "File phải lớn hơn 0 byte.")
    if len(data) > MAX_FILE_BYTES:
        raise ServiceError(413, "File không được vượt quá 10 MiB.")
    signatures = {
        "application/pdf": data.startswith(b"%PDF-"),
        "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": data.startswith(b"\xff\xd8\xff"),
        "image/webp": len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    }
    if not signatures[content_type]:
        raise ServiceError(415, "Nội dung file không khớp định dạng đã chọn.")


def _timestamp(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return str(value or "")


class FileService:
    def __init__(self, bucket, lock_dir: Path | str | None = None, state_dir: Path | str | None = None):
        self.bucket = bucket
        default_dir = os.getenv("FILESPACE_LOCK_DIR") or ROOT / ".runtime" / "file-locks"
        self.lock_dir = Path(lock_dir if lock_dir is not None else default_dir)
        default_state = self.lock_dir / "state" if lock_dir is not None else (os.getenv("FILESPACE_DATA_DIR") or ROOT / ".data")
        self.state = FileState(bucket.name, state_dir if state_dir is not None else default_state)

    @contextmanager
    def _account_lock(self, uid):
        # All API workers must share this directory. Multiple independent hosts
        # require a distributed transaction/lock instead of local SQLite.
        key = hashlib.sha256(f"{self.bucket.name}\0{uid}".encode()).hexdigest()
        connection = None
        try:
            self.lock_dir.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(str(self.lock_dir / f"{key}.sqlite3"), timeout=30)
            connection.execute("CREATE TABLE IF NOT EXISTS file_lock (id INTEGER PRIMARY KEY)")
            connection.execute("BEGIN IMMEDIATE")
        except (sqlite3.Error, OSError):
            if connection is not None:
                connection.close()
            raise ServiceError(503, "Chưa khóa được tài khoản để xử lý file. Vui lòng thử lại.") from None
        try:
            yield
            connection.commit()
        except sqlite3.OperationalError:
            connection.rollback()
            raise ServiceError(503, "Tài khoản đang xử lý file khác. Vui lòng thử lại.") from None
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _prefix(self, uid):
        return f"users/{validate_uid(uid)}/"

    def _all_blobs(self, uid):
        prefix = self._prefix(uid)
        # Include any nested/legacy objects in quota usage, even though phase 1
        # exposes only flat file names. Never trust browser metadata counters.
        return [blob for blob in self.bucket.list_blobs(prefix=prefix, timeout=STORAGE_TIMEOUT)
                if blob.name.startswith(prefix)]

    @staticmethod
    def _usage(blobs):
        return {"usedBytes": sum(int(blob.size or 0) for blob in blobs),
                "maxBytes": MAX_USER_BYTES, "maxFileBytes": MAX_FILE_BYTES,
                "fileCount": len(blobs), "maxFiles": MAX_USER_FILES}

    @staticmethod
    def _info(blob, uid, row=None):
        leaf = blob.name[len(f"users/{uid}/"):]
        original = (blob.metadata or {}).get("originalName")
        fallback = original if isinstance(original, str) and original else re.sub(r"^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}-", "", leaf)
        row = row or {}
        return {"name": leaf, "fullPath": blob.name,
                "size": int(blob.size or 0), "contentType": blob.content_type,
                "updated": _timestamp(blob.updated), "displayName": row.get("display_name") or fallback,
                "folderId": row.get("folder_id")}

    @staticmethod
    def _folder_info(row):
        return {"id": row["id"], "name": row["name"], "parentId": row["parent_id"], "createdAt": row["created_at"]}

    @staticmethod
    def _folder_chain(folders, folder_id):
        chain, seen = [], set()
        while folder_id is not None:
            if folder_id in seen or len(chain) >= MAX_FOLDER_DEPTH:
                raise ServiceError(503, "Cấu trúc thư mục không hợp lệ.")
            seen.add(folder_id)
            row = folders.get(folder_id)
            if row is None:
                raise ServiceError(404, "Không tìm thấy thư mục trong tài khoản của bạn.")
            chain.append(row)
            folder_id = row["parent_id"]
        return list(reversed(chain))

    @staticmethod
    def _duplicate_folder(folders, name, parent_id, except_id=None):
        return any(row["id"] != except_id and row["parent_id"] == parent_id
                   and unicodedata.normalize("NFC", row["name"]).casefold() == name.casefold()
                   for row in folders.values())

    def list_folders(self, uid, parent_id=None, all_folders=False):
        validate_uid(uid)
        parent_id = validate_folder_id(parent_id)
        with self._account_lock(uid):
            folders = self.state.all_folders(uid)
            chain = self._folder_chain(folders, parent_id)
            rows = list(folders.values()) if all_folders else [row for row in folders.values() if row["parent_id"] == parent_id]
            rows.sort(key=lambda row: (row["name"].casefold(), row["id"]))
            return {"folders": [self._folder_info(row) for row in rows],
                    "breadcrumbs": [] if all_folders else [{"id": row["id"], "name": row["name"]} for row in chain]}

    def create_folder(self, uid, name, parent_id=None):
        validate_uid(uid)
        name, parent_id = validate_display_name(name), validate_folder_id(parent_id)
        with self._account_lock(uid):
            folders = self.state.all_folders(uid)
            chain = self._folder_chain(folders, parent_id)
            if len(folders) >= MAX_FOLDERS:
                raise ServiceError(409, "Mỗi tài khoản có tối đa 100 thư mục.")
            if len(chain) >= MAX_FOLDER_DEPTH:
                raise ServiceError(409, "Thư mục chỉ được lồng tối đa 10 cấp.")
            if self._duplicate_folder(folders, name, parent_id):
                raise ServiceError(409, "Đã có thư mục cùng tên trong thư mục này.")
            folder_id, created_at = str(uuid4()), datetime.now(timezone.utc).isoformat()
            try:
                self.state.create_folder(uid, folder_id, name, parent_id, created_at)
            except sqlite3.IntegrityError:
                raise ServiceError(409, "Đã có thư mục cùng tên trong thư mục này.") from None
            return {"id": folder_id, "name": name, "parentId": parent_id, "createdAt": created_at}

    def update_folder(self, uid, folder_id, changes):
        validate_uid(uid)
        folder_id = validate_folder_id(folder_id)
        if not isinstance(changes, dict) or not changes or set(changes) - {"name", "parentId"}:
            raise ServiceError(400, "Cần tên hoặc thư mục cha hợp lệ để cập nhật.")
        with self._account_lock(uid):
            folders = self.state.all_folders(uid)
            row = folders.get(folder_id)
            if row is None:
                raise ServiceError(404, "Không tìm thấy thư mục trong tài khoản của bạn.")
            name = validate_display_name(changes["name"]) if "name" in changes else row["name"]
            parent_id = validate_folder_id(changes["parentId"]) if "parentId" in changes else row["parent_id"]
            chain = self._folder_chain(folders, parent_id)
            if folder_id == parent_id or any(parent["id"] == folder_id for parent in chain):
                raise ServiceError(409, "Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó.")
            def subtree_height(current, seen):
                if current in seen:
                    raise ServiceError(503, "Cấu trúc thư mục không hợp lệ.")
                children = [item["id"] for item in folders.values() if item["parent_id"] == current]
                return 1 + max((subtree_height(child, seen | {current}) for child in children), default=0)
            if len(chain) + subtree_height(folder_id, set()) > MAX_FOLDER_DEPTH:
                raise ServiceError(409, "Di chuyển này sẽ làm thư mục vượt quá 10 cấp.")
            if self._duplicate_folder(folders, name, parent_id, folder_id):
                raise ServiceError(409, "Đã có thư mục cùng tên trong thư mục này.")
            try:
                self.state.update_folder(uid, folder_id, name, parent_id)
            except sqlite3.IntegrityError:
                raise ServiceError(409, "Đã có thư mục cùng tên trong thư mục này.") from None
            return {"id": folder_id, "name": name, "parentId": parent_id, "createdAt": row["created_at"]}

    def delete_folder(self, uid, folder_id):
        validate_uid(uid)
        folder_id = validate_folder_id(folder_id)
        with self._account_lock(uid):
            folders = self.state.all_folders(uid)
            if folder_id not in folders:
                raise ServiceError(404, "Không tìm thấy thư mục trong tài khoản của bạn.")
            if any(row["parent_id"] == folder_id for row in folders.values()) or self.state.folder_has_files(uid, folder_id):
                raise ServiceError(409, "Chỉ xóa được thư mục rỗng, kể cả các file đang nằm trong thùng rác.")
            self.state.delete_folder(uid, folder_id)

    def update_file(self, uid, name, changes):
        validate_uid(uid)
        validate_leaf(name)
        if not isinstance(changes, dict) or not changes or set(changes) - {"displayName", "folderId"}:
            raise ServiceError(400, "Cần tên hiển thị hoặc thư mục hợp lệ để cập nhật.")
        with self._account_lock(uid):
            blob = self._owned_blob(uid, name)
            row = self._require_active(uid, name)
            info = self._info(blob, uid, row)
            display_name = validate_display_name(changes["displayName"]) if "displayName" in changes else info["displayName"]
            folder_id = validate_folder_id(changes["folderId"]) if "folderId" in changes else info["folderId"]
            self._folder_chain(self.state.all_folders(uid), folder_id)
            self.state.set_metadata(uid, name, display_name, folder_id)
            row.update(display_name=display_name, folder_id=folder_id)
            return self._info(blob, uid, row)

    @staticmethod
    def _query(view, uid, q, file_type, sort, scope="all", folder_id=None):
        if not isinstance(q, str) or len(q) > 200:
            raise ServiceError(400, "Từ khóa tìm kiếm không hợp lệ.")
        if file_type not in {"all", "pdf", "image"} or sort not in {"name", "newest", "oldest", "size"} or scope not in {"all", "folder"}:
            raise ServiceError(400, "Bộ lọc hoặc cách sắp xếp không hợp lệ.")
        q = unicodedata.normalize("NFC", q).strip().casefold()
        return {"view": view, "uid": uid, "q": q, "type": file_type, "sort": sort,
                "scope": scope, "folderId": folder_id if scope == "folder" else None}

    @staticmethod
    def _page(files, page_token, query):
        fingerprint = hashlib.sha256(json.dumps(query, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        offset = 0
        if page_token:
            try:
                if not isinstance(page_token, str) or len(page_token) > 1024:
                    raise ValueError
                cursor = json.loads(base64.b64decode(page_token.encode("ascii"), altchars=b"-_", validate=True).decode())
                if (not isinstance(cursor, dict) or cursor.get("v") != 3 or cursor.get("query") != fingerprint
                        or type(cursor.get("offset")) is not int or not 0 <= cursor["offset"] <= 1000000):
                    raise ValueError
                offset = cursor["offset"]
            except (ValueError, UnicodeError, TypeError):
                raise ServiceError(400, "Trang danh sách không khớp bộ lọc hiện tại. Hãy làm mới.") from None
        filtered = [item for item in files if query["q"] in unicodedata.normalize("NFC", item["displayName"]).casefold()
                    and (query["type"] == "all" or (query["type"] == "pdf" and item["contentType"] == "application/pdf")
                         or (query["type"] == "image" and str(item["contentType"]).startswith("image/")))
                    and (query["scope"] != "folder" or item["folderId"] == query["folderId"])]
        def time_key(item):
            try:
                return datetime.fromisoformat(item["updated"].replace("Z", "+00:00")).timestamp()
            except (ValueError, AttributeError, OSError):
                return 0
        ordering = {
            "name": lambda item: (item["displayName"].casefold(), item["fullPath"]),
            "newest": lambda item: (-time_key(item), item["fullPath"]),
            "oldest": lambda item: (time_key(item), item["fullPath"]),
            "size": lambda item: (-item["size"], item["fullPath"]),
        }
        filtered.sort(key=ordering[query["sort"]])
        next_page = None
        if offset + PAGE_SIZE < len(filtered):
            next_page = base64.urlsafe_b64encode(json.dumps({"v": 3, "query": fingerprint, "offset": offset + PAGE_SIZE}).encode()).decode()
        return {"files": filtered[offset:offset + PAGE_SIZE], "nextPageToken": next_page, "total": len(filtered)}

    @staticmethod
    def _page_cursor(value):
        try:
            if not isinstance(value, str) or len(value) > 1024:
                raise ValueError
            decoded = base64.b64decode(value.encode("ascii"), altchars=b"-_", validate=True).decode("utf-8")
            return validate_leaf(decoded)
        except (ValueError, UnicodeError, ServiceError):
            raise ServiceError(400, "Trang danh sách file không hợp lệ.") from None

    def _list_owned(self, uid, page_token=None, trashed=False, *, folder_id=None, scope="all", q="", file_type="all", sort="name"):
        prefix = self._prefix(uid)
        folder_id = validate_folder_id(folder_id)
        query = self._query("trash" if trashed else "own", uid, q, file_type, sort, scope, folder_id)
        with self._account_lock(uid):
            blobs = self._all_blobs(uid)
            states, counts = self.state.owner_snapshot(uid)
            if scope == "folder":
                self._folder_chain(self.state.all_folders(uid), folder_id)
        files = []
        for blob in blobs:
            name = blob.name[len(prefix):]
            if not name or "/" in name:
                continue
            row = states.get(name, {"status": "active", "trashed_at": None})
            visible = row["status"] in {"trash", "purging"} if trashed else row["status"] == "active"
            if visible:
                item = self._info(blob, uid, row)
                item["shareCount"] = 0 if trashed else counts.get(name, 0)
                if trashed:
                    item["trashedAt"] = row["trashed_at"]
                files.append(item)
        return {**self._page(files, page_token, query), "usage": self._usage(blobs)}

    def list_files(self, uid, page_token=None, *, folder_id=None, scope="all", q="", file_type="all", sort="name"):
        return self._list_owned(uid, page_token, folder_id=folder_id, scope=scope, q=q, file_type=file_type, sort=sort)

    def list_trash(self, uid, page_token=None, *, q="", file_type="all", sort="name"):
        return self._list_owned(uid, page_token, trashed=True, q=q, file_type=file_type, sort=sort)

    def upload(self, uid, data: bytes, original_name: str, content_type: str, folder_id=None):
        prefix = self._prefix(uid)
        name = safe_file_name(original_name)
        validate_upload(data, content_type)
        folder_id = validate_folder_id(folder_id)
        with self._account_lock(uid):
            self._folder_chain(self.state.all_folders(uid), folder_id)
            usage = self._usage(self._all_blobs(uid))
            if usage["fileCount"] >= MAX_USER_FILES:
                raise ServiceError(409, "Mỗi tài khoản có tối đa 200 file. Hãy xóa bớt file để tải lên.")
            if usage["usedBytes"] + len(data) > MAX_USER_BYTES:
                raise ServiceError(409, "Không đủ dung lượng. Mỗi tài khoản có tối đa 50 MiB.")
            blob = self.bucket.blob(f"{prefix}{uuid4()}-{name}")
            blob.cache_control = "private, max-age=0, no-store"
            # No Firebase download token: all downloads require a verified ID token.
            blob.metadata = {"originalName": name}
            try:
                blob.upload_from_string(data, content_type=content_type,
                                        if_generation_match=0, timeout=STORAGE_TIMEOUT)
                blob.reload(timeout=STORAGE_TIMEOUT)
            except PreconditionFailed:
                raise ServiceError(409, "File đã tồn tại. Vui lòng thử lại.") from None
            leaf = blob.name[len(prefix):]
            self.state.set_metadata(uid, leaf, name, folder_id)
            return self._info(blob, uid, {"display_name": name, "folder_id": folder_id})

    def _owned_blob(self, uid, name):
        blob = self.bucket.blob(self._prefix(uid) + validate_leaf(name))
        try:
            blob.reload(timeout=STORAGE_TIMEOUT)
        except NotFound:
            raise ServiceError(404, "Không tìm thấy file trong tài khoản của bạn.") from None
        return blob

    def _download(self, blob, name, row=None):
        if int(blob.size or 0) > MAX_FILE_BYTES:
            raise ServiceError(413, "File cũ vượt giới hạn tải của bản thử nghiệm (10 MiB).")
        try:
            data = blob.download_as_bytes(if_generation_match=blob.generation, timeout=STORAGE_TIMEOUT)
        except NotFound:
            raise ServiceError(404, "Không tìm thấy file trong tài khoản của bạn.") from None
        except PreconditionFailed:
            raise ServiceError(409, "File vừa thay đổi. Vui lòng tải lại danh sách.") from None
        owner_uid = blob.name.split("/", 2)[1]
        display_name = self._info(blob, owner_uid, row)["displayName"]
        content_type = blob.content_type if blob.content_type in ALLOWED_TYPES else "application/octet-stream"
        return data, content_type, display_name

    def _require_active(self, uid, name):
        row = self.state.get(uid, name)
        if row["status"] != "active":
            raise ServiceError(404, "Không tìm thấy file đang hoạt động.")
        return row

    def content(self, uid, name):
        validate_uid(uid)
        validate_leaf(name)
        with self._account_lock(uid):
            row = self._require_active(uid, name)
            return self._download(self._owned_blob(uid, name), name, row)

    @staticmethod
    def _grant_info(row):
        return {"recipientUid": row["recipient_uid"], "email": row["email"], "createdAt": row["created_at"]}

    def shares(self, uid, name):
        validate_uid(uid)
        validate_leaf(name)
        with self._account_lock(uid):
            self._owned_blob(uid, name)
            self._require_active(uid, name)
            return {"shares": [self._grant_info(row) for row in self.state.grants(uid, name)]}

    def create_share(self, uid, name, email, lookup_recipient, owner_email=None):
        validate_uid(uid)
        validate_leaf(name)
        if (not isinstance(email, str) or len(email) > 254
                or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email.strip())):
            raise ServiceError(400, "Email người nhận không hợp lệ.")
        email = email.strip()
        with self._account_lock(uid):
            # Do not allow arbitrary authenticated users to probe email accounts
            # by referencing someone else's file or a nonexistent file.
            self._owned_blob(uid, name)
            self._require_active(uid, name)
            recipient = lookup_recipient(email)
            value = lambda key, default=None: recipient.get(key, default) if isinstance(recipient, dict) else getattr(recipient, key, default)
            recipient_uid = validate_uid(value("uid"))
            if value("disabled", False):
                raise ServiceError(404, "Không tìm thấy tài khoản người nhận đang hoạt động.")
            if recipient_uid == uid:
                raise ServiceError(400, "Bạn đã là chủ sở hữu của file này.")
            existing = self.state.grants(uid, name)
            if len(existing) >= MAX_SHARES_PER_FILE and not any(row["recipient_uid"] == recipient_uid for row in existing):
                raise ServiceError(409, "Mỗi file được chia sẻ cho tối đa 20 tài khoản.")
            row = self.state.add_grant(uid, name, recipient_uid, value("email") or email,
                                       owner_email, datetime.now(timezone.utc).isoformat())
            return self._grant_info(row)

    def revoke_share(self, uid, name, recipient_uid):
        validate_uid(uid)
        validate_uid(recipient_uid)
        validate_leaf(name)
        with self._account_lock(uid):
            self._owned_blob(uid, name)
            self.state.remove_grant(uid, name, recipient_uid)

    def shared_content(self, viewer_uid, owner_uid, name):
        validate_uid(viewer_uid)
        validate_uid(owner_uid)
        validate_leaf(name)
        with self._account_lock(owner_uid):
            row = self._require_active(owner_uid, name)
            if not self.state.has_grant(owner_uid, name, viewer_uid):
                raise ServiceError(404, "Không tìm thấy file được chia sẻ với bạn.")
            return self._download(self._owned_blob(owner_uid, name), name, row)

    def list_shared(self, uid, page_token=None, *, q="", file_type="all", sort="name"):
        validate_uid(uid)
        query = self._query("shared", uid, q, file_type, sort)
        grants = self.state.recipient_grants(uid)
        files = []
        for grant in grants:
            owner_uid, name = grant["owner_uid"], grant["name"]
            validate_uid(owner_uid)
            validate_leaf(name)
            with self._account_lock(owner_uid):
                row = self.state.get(owner_uid, name)
                if row["status"] != "active" or not self.state.has_grant(owner_uid, name, uid):
                    continue
                try:
                    blob = self._owned_blob(owner_uid, name)
                except ServiceError as exc:
                    if exc.status_code == 404:
                        continue
                    raise
                info = self._info(blob, owner_uid, row)
                info.update(ownerUid=owner_uid, ownerEmail=grant["owner_email"], sharedAt=grant["created_at"])
                files.append(info)
        return {**self._page(files, page_token, query), "usage": self._usage(self._all_blobs(uid))}

    def trash(self, uid, name):
        validate_uid(uid)
        validate_leaf(name)
        with self._account_lock(uid):
            self._owned_blob(uid, name)
            row = self.state.get(uid, name)
            if row["status"] == "purged":
                raise ServiceError(404, "Không tìm thấy file đang hoạt động.")
            timestamp = row["trashed_at"] or datetime.now(timezone.utc).isoformat()
            self.state.set_status(uid, name, "trash", timestamp, clear_shares=True)

    def restore(self, uid, name):
        validate_uid(uid)
        validate_leaf(name)
        with self._account_lock(uid):
            self._owned_blob(uid, name)
            row = self.state.get(uid, name)
            if row["status"] not in {"trash", "purging"}:
                raise ServiceError(409, "Chỉ khôi phục file trong thùng rác.")
            folder_id = row.get("folder_id")
            if folder_id not in self.state.all_folders(uid):
                folder_id = None
            self.state.restore_private(uid, name, folder_id)

    def delete(self, uid, name):
        validate_uid(uid)
        validate_leaf(name)
        with self._account_lock(uid):
            row = self.state.get(uid, name)
            try:
                blob = self._owned_blob(uid, name)
            except ServiceError as exc:
                if exc.status_code != 404 or row["status"] not in {"trash", "purging"}:
                    raise
                # A previous purge may have deleted the object before its final
                # database commit failed. A retry can safely finalize tombstone.
                self.state.set_status(uid, name, "purged", row["trashed_at"], clear_shares=True)
                return
            if row["status"] not in {"trash", "purging"}:
                raise ServiceError(409, "Hãy chuyển file vào thùng rác trước khi xóa vĩnh viễn.")
            self.state.set_status(uid, name, "purging", row["trashed_at"], clear_shares=True)
            try:
                blob.delete(if_generation_match=blob.generation, timeout=STORAGE_TIMEOUT)
            except NotFound:
                pass
            except PreconditionFailed:
                self.state.set_status(uid, name, "trash", row["trashed_at"], clear_shares=True)
                raise ServiceError(409, "File vừa thay đổi. Vui lòng tải lại danh sách.") from None
            except Exception:
                # If this state write also fails, 'purging' is still private and
                # appears in trash while the remote object continues using quota.
                self.state.set_status(uid, name, "trash", row["trashed_at"], clear_shares=True)
                raise
            # Keep a tombstone. Failure here leaves 'purging', never active or a
            # restored grant, even if the remote operation already succeeded.
            self.state.set_status(uid, name, "purged", row["trashed_at"], clear_shares=True)
