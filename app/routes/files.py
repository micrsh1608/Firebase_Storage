"""Authenticated, private file operations. No owner fields come from the client."""
import logging
import re
from io import BytesIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from firebase_admin import auth, storage
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.file_service import ALLOWED_TYPES, MAX_FILE_BYTES, FileService, ServiceError
from app.routes.auth_demo import verified_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/files", tags=["Private files"])
folders_router = APIRouter(prefix="/api/folders", tags=["Folders"])


class ShareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)


class FolderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    parentId: str | None = Field(None, max_length=128)


class FolderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(None, min_length=1, max_length=120)
    parentId: str | None = Field(None, max_length=128)


class FileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    displayName: str | None = Field(None, min_length=1, max_length=120)
    folderId: str | None = Field(None, max_length=128)


def get_file_service(request: Request):
    # Tests can inject a service backed by an isolated in-memory/fake bucket.
    existing = request.app.state.file_service
    if existing is not None:
        return existing
    try:
        firebase_app = request.app.state.get_firebase_app()
        service = FileService(storage.bucket(name=request.app.state.settings.bucket, app=firebase_app))
        request.app.state.file_service = service
        return service
    except Exception as exc:
        logger.warning("File service initialization failed: %s", type(exc).__name__)
        raise HTTPException(503, "Chưa kết nối được kho lưu trữ. Vui lòng thử lại.") from None


def _call(operation, *args, **kwargs):
    try:
        return operation(*args, **kwargs)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from None
    except Exception as exc:
        # Credentials, tokens, upstream responses and internal paths stay server-side.
        logger.warning("File operation failed: %s", type(exc).__name__)
        raise HTTPException(503, "Kho lưu trữ tạm thời không phản hồi. Vui lòng thử lại.") from None


@router.get("")
def list_files(request: Request, pageToken: str | None = Query(None, max_length=1024),
               folderId: str | None = Query(None, max_length=128), scope: str = "all",
               q: str = Query("", max_length=200), file_type: str = Query("all", alias="type"), sort: str = "name",
               claims: dict = Depends(verified_user)):
    service = get_file_service(request)
    return _call(service.list_files, claims["uid"], pageToken, folder_id=folderId, scope=scope, q=q, file_type=file_type, sort=sort)


@router.get("/trash")
def list_trash(request: Request, pageToken: str | None = Query(None, max_length=1024),
               q: str = Query("", max_length=200), file_type: str = Query("all", alias="type"), sort: str = "name",
               claims: dict = Depends(verified_user)):
    return _call(get_file_service(request).list_trash, claims["uid"], pageToken, q=q, file_type=file_type, sort=sort)


@router.get("/shared-with-me")
def list_shared(request: Request, pageToken: str | None = Query(None, max_length=1024),
                q: str = Query("", max_length=200), file_type: str = Query("all", alias="type"), sort: str = "name",
                claims: dict = Depends(verified_user)):
    return _call(get_file_service(request).list_shared, claims["uid"], pageToken, q=q, file_type=file_type, sort=sort)


def _download_response(result, preview=False, range_header: str | None = None):
    data, content_type, download_name = result
    if preview and content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Định dạng này chưa hỗ trợ xem trước.")

    # ── Giai đoạn 3: HTTP Range Request support ────────────────────────────────
    total = len(data)
    start, end = 0, total - 1
    use_range = False
    if range_header and not preview:
        m = re.fullmatch(r"bytes=(\d+)-(\d*)", range_header.strip())
        if m:
            s = int(m.group(1))
            e = int(m.group(2)) if m.group(2) else total - 1
            if 0 <= s <= e < total:
                start, end, use_range = s, e, True
            elif s >= total:
                # 416 Range Not Satisfiable
                raise HTTPException(
                    416, "Phạm vi yêu cầu ngoài kích thước file.",
                    headers={"Content-Range": f"bytes */{total}"}
                )
    # ──────────────────────────────────────────────────────────────────────────

    headers = {
        "Content-Disposition": ("inline" if preview else "attachment") + "; filename*=UTF-8''" + quote(download_name, safe=""),
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
    }
    if preview:
        headers["Content-Security-Policy"] = "sandbox; default-src 'none'; frame-ancestors 'self'"
    if use_range:
        headers["Content-Range"] = f"bytes {start}-{end}/{total}"
        return Response(data[start:end + 1], status_code=206, media_type=content_type, headers=headers)
    return Response(data, media_type=content_type, headers=headers)


@router.get("/shared/{owner_uid}/{name}/content")
def shared_content(owner_uid: str, name: str, request: Request, claims: dict = Depends(verified_user)):
    service = get_file_service(request)
    range_header = request.headers.get("Range")
    return _download_response(_call(service.shared_content, claims["uid"], owner_uid, name), range_header=range_header)


@router.get("/shared/{owner_uid}/{name}/preview")
def shared_preview(owner_uid: str, name: str, request: Request, claims: dict = Depends(verified_user)):
    return _download_response(_call(get_file_service(request).shared_content, claims["uid"], owner_uid, name), preview=True)


@router.put("", status_code=201)
async def upload_file(request: Request, name: str = Query(..., min_length=1, max_length=1024),
                      folderId: str | None = Query(None, max_length=128),
                      claims: dict = Depends(verified_user)):
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Chỉ nhận JPEG, PNG, WebP hoặc PDF.")
    # The declared length is an early rejection only. Actual streamed bytes are
    # counted independently so chunked uploads cannot bypass the size limit.
    declared_length = request.headers.get("content-length")
    if declared_length is not None:
        try:
            declared_length = int(declared_length)
        except ValueError:
            raise HTTPException(400, "Kích thước yêu cầu không hợp lệ.") from None
        if declared_length < 0:
            raise HTTPException(400, "Kích thước yêu cầu không hợp lệ.")
        if declared_length > MAX_FILE_BYTES:
            raise HTTPException(413, "File không được vượt quá 10 MiB.")
    with BytesIO() as body:
        total_bytes = 0
        try:
            async for chunk in request.stream():
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_BYTES:
                    raise HTTPException(413, "File không được vượt quá 10 MiB.")
                body.write(chunk)
        except ClientDisconnect:
            raise HTTPException(400, "Kết nối tải lên đã bị ngắt. Vui lòng thử lại.") from None
        payload = body.getvalue()
    service = await run_in_threadpool(get_file_service, request)
    return await run_in_threadpool(_call, service.upload, claims["uid"], payload, name, content_type, folderId)


@router.get("/{name}/content")
def download_file(name: str, request: Request, claims: dict = Depends(verified_user)):
    service = get_file_service(request)
    range_header = request.headers.get("Range")
    return _download_response(_call(service.content, claims["uid"], name), range_header=range_header)


@router.get("/{name}/preview")
def preview_file(name: str, request: Request, claims: dict = Depends(verified_user)):
    return _download_response(_call(get_file_service(request).content, claims["uid"], name), preview=True)


@router.patch("/{name}")
def update_file(name: str, body: FileUpdate, request: Request, claims: dict = Depends(verified_user)):
    return _call(get_file_service(request).update_file, claims["uid"], name, body.model_dump(exclude_unset=True))


@router.get("/{name}/shares")
def file_shares(name: str, request: Request, claims: dict = Depends(verified_user)):
    return _call(get_file_service(request).shares, claims["uid"], name)


@router.post("/{name}/shares", status_code=201)
def create_share(name: str, body: ShareRequest, request: Request, claims: dict = Depends(verified_user)):
    def lookup_recipient(email):
        try:
            recipient = auth.get_user_by_email(email, app=request.app.state.get_firebase_app())
            # A registered email is not proof that its account controls the
            # inbox. The service invokes this callback only after confirming
            # the caller owns the active file. Local emulator QA is explicit.
            if request.app.state.settings.mode == "cloud" and not recipient.email_verified:
                raise ServiceError(409, "Người nhận cần xác minh email trước khi được chia sẻ.")
            return recipient
        except auth.UserNotFoundError:
            raise ServiceError(404, "Người nhận cần đăng ký tài khoản FileSpace trước.") from None
        except ValueError:
            raise ServiceError(400, "Email người nhận không hợp lệ.") from None
    return _call(get_file_service(request).create_share, claims["uid"], name,
                 body.email, lookup_recipient, claims.get("email"))


@router.delete("/{name}/shares/{recipient_uid}", status_code=204)
def revoke_share(name: str, recipient_uid: str, request: Request, claims: dict = Depends(verified_user)):
    _call(get_file_service(request).revoke_share, claims["uid"], name, recipient_uid)
    return Response(status_code=204)


@router.post("/{name}/trash", status_code=204)
def trash_file(name: str, request: Request, claims: dict = Depends(verified_user)):
    _call(get_file_service(request).trash, claims["uid"], name)
    return Response(status_code=204)


@router.post("/{name}/restore", status_code=204)
def restore_file(name: str, request: Request, claims: dict = Depends(verified_user)):
    _call(get_file_service(request).restore, claims["uid"], name)
    return Response(status_code=204)


@router.delete("/{name}", status_code=204)
def delete_file(name: str, request: Request, claims: dict = Depends(verified_user)):
    service = get_file_service(request)
    _call(service.delete, claims["uid"], name)
    return Response(status_code=204)


@folders_router.get("")
def list_folders(request: Request, parentId: str | None = Query(None, max_length=128),
                 all_folders: bool = Query(False, alias="all"), claims: dict = Depends(verified_user)):
    return _call(get_file_service(request).list_folders, claims["uid"], parentId, all_folders)


@folders_router.post("", status_code=201)
def create_folder(body: FolderCreate, request: Request, claims: dict = Depends(verified_user)):
    return _call(get_file_service(request).create_folder, claims["uid"], body.name, body.parentId)


@folders_router.patch("/{folder_id}")
def update_folder(folder_id: str, body: FolderUpdate, request: Request, claims: dict = Depends(verified_user)):
    return _call(get_file_service(request).update_folder, claims["uid"], folder_id, body.model_dump(exclude_unset=True))


@folders_router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: str, request: Request, claims: dict = Depends(verified_user)):
    _call(get_file_service(request).delete_folder, claims["uid"], folder_id)
    return Response(status_code=204)
