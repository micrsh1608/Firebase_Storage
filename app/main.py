"""REST API nền tảng cho seminar – chạy ngay được khi chưa có Blaze."""
import os
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.firebase_client import storage_enabled, storage_configured, check_storage_access

logger = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "frontend"

app = FastAPI(title="Student File Hub – Member 1", version="1.0.0")
app.mount("/static", StaticFiles(directory=str(WEB)), name="static")


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(WEB / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "student-file-hub", "backend": "FastAPI"}


@app.get("/api/project-status")
def project_status():
    """Chỉ hiện trạng thái; không trả credential/key bí mật."""
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    return {
        "firebase_project_configured": bool(project_id and project_id != "your-firebase-project-id"),
        "firebase_project_id": project_id if project_id != "your-firebase-project-id" else "",
        "storage_enabled": storage_enabled(),
        "storage_configured": storage_configured(),
        "auth_note": "Kiểm tra Email/Password đã bật trên Firebase Console; API này không xác minh cấu hình Auth.",
    }


@app.get("/api/storage-check")
def storage_check():
    if not storage_enabled():
        return {
            "status": "pending_blaze",
            "message": "Chưa dùng Storage thật. Các API nền tảng vẫn hoạt động bình thường.",
        }
    try:
        name = check_storage_access()
        return {"status": "ok", "bucket": name, "message": "Kết nối Cloud Storage thành công."}
    except Exception as exc:
        logger.exception("Storage connectivity check failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được Storage. Kiểm tra cấu hình, Blaze, bucket và IAM trên server.",
        ) from exc
