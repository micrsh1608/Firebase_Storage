"""Kết nối Storage theo nhu cầu; không bắt buộc Blaze để chạy FastAPI.

Lưu ý: Admin SDK chạy với quyền server; Storage Rules của client không
kiểm soát các thao tác này. Thành viên 3 chịu trách nhiệm phân quyền backend.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def storage_enabled() -> bool:
    return os.getenv("STORAGE_ENABLED", "false").lower() == "true"


def storage_configured() -> bool:
    return storage_enabled() and bool(os.getenv("FIREBASE_STORAGE_BUCKET", "").strip())


def check_storage_access() -> str:
    """Chỉ gọi sau khi Blaze được kích hoạt, bucket đã được tạo."""
    if not storage_enabled():
        raise RuntimeError("Storage đang tạm tắt: chờ kích hoạt Blaze")
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip()
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not bucket_name or not project_id:
        raise RuntimeError("Thiếu FIREBASE_STORAGE_BUCKET hoặc FIREBASE_PROJECT_ID")

    import firebase_admin
    from firebase_admin import credentials, storage

    key_path = Path(os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "secrets/serviceAccountKey.json"))
    if not key_path.is_absolute():
        key_path = ROOT / key_path
    if not key_path.is_file():
        raise FileNotFoundError("Chưa có service account JSON tại đường dẫn được khai báo")

    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app(
            credentials.Certificate(str(key_path)),
            {"projectId": project_id, "storageBucket": bucket_name},
        )
    bucket = storage.bucket()
    if not bucket.exists():
        raise RuntimeError("Bucket không tồn tại hoặc không truy cập được")
    return bucket.name
