"""Member 1 foundation with member 2 Auth and file-operations integration."""
import logging
import mimetypes
from contextlib import asynccontextmanager
from threading import Lock

import firebase_admin
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.firebase_client import check_storage_access
from app.firebase_admin_client import initialize_firebase
from app.routes.auth_demo import router
from app.routes.files import router as files_router, folders_router
from app.settings import ROOT, Settings

logger = logging.getLogger(__name__)
WEB = ROOT / "frontend"
# Windows registry mappings can otherwise serve .mjs as application/octet-stream.
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")


def create_app(settings: Settings | None = None):
    config = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(application):
        # Foundation routes and browser Auth do not require a server private key.
        try:
            yield
        finally:
            if application.state.firebase_app is not None:
                firebase_admin.delete_app(application.state.firebase_app)
                application.state.firebase_app = None

    application = FastAPI(title="FileSpace — Student File Hub", version="1.3.1", lifespan=lifespan)
    application.state.settings = config
    application.state.firebase_app = None
    application.state.file_service = None
    admin_lock = Lock()

    def get_firebase_app():
        if application.state.firebase_app is None:
            with admin_lock:
                if application.state.firebase_app is None:
                    application.state.firebase_app = initialize_firebase(config)
        return application.state.firebase_app

    application.state.get_firebase_app = get_firebase_app
    if config.mode == "emulator":
        application.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]"])

    @application.middleware("http")
    async def response_headers(request, call_next):
        response = await call_next(request)
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.url.path.startswith("/api/") or request.url.path in ("/", "/setup"):
            response.headers["Cache-Control"] = "no-store"
        elif request.url.path.startswith("/static/"):
            # Keep seminar/demo machines from retaining obsolete CSS/JS assets.
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response

    @application.get("/", include_in_schema=False)
    def home():
        return FileResponse(WEB / "index.html")

    @application.get("/setup", include_in_schema=False)
    def setup_dashboard():
        return FileResponse(WEB / "setup.html")

    @application.get("/api/health")
    def health():
        return {"status": "ok", "service": "student-file-hub", "backend": "FastAPI"}

    @application.get("/health")
    def demo_health():
        return {"status": "ok", "mode": config.mode}

    @application.get("/api/project-status")
    def project_status():
        return {
            "firebase_project_configured": bool(config.project_id),
            "firebase_project_id": config.project_id,
            "mode": config.mode,
            # These flags refer to the member-1 cloud Admin connectivity check.
            "storage_enabled": config.storage_check_enabled,
            "storage_configured": config.mode == "cloud" and config.storage_check_enabled and bool(config.bucket),
            "storage_emulator_enabled": config.mode == "emulator",
            "auth_note": "Kiểm tra Email/Password trên Firebase Console khi dùng cloud; API này chỉ báo cấu hình.",
        }

    @application.get("/api/storage-check")
    def storage_check():
        if config.mode == "emulator":
            return {"status": "emulator", "bucket": config.bucket,
                    "message": "Đang dùng Firebase Emulator; không truy cập bucket Cloud thật."}
        if not config.storage_check_enabled:
            return {"status": "disabled",
                    "message": "Đã chọn Cloud mode nhưng kiểm tra Admin Storage đang tắt (STORAGE_ENABLED=false)."}
        try:
            # Reuse the exact same named Admin app used by /api/auth/me.
            name = check_storage_access(get_firebase_app(), config.bucket)
            return {"status": "ok", "bucket": name, "message": "Kết nối Cloud Storage thành công."}
        except Exception as exc:
            logger.warning("Storage connectivity check failed: %s", type(exc).__name__)
            raise HTTPException(503, "Không kết nối được Storage. Kiểm tra cấu hình, Blaze, bucket và IAM trên server.") from None

    @application.get("/api/demo-config")
    def demo_config():
        return config.public_config()

    application.include_router(router)
    application.include_router(files_router)
    application.include_router(folders_router)
    application.mount("/static", StaticFiles(directory=str(WEB)), name="static")
    return application


app = create_app()
