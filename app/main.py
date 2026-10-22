"""Member 1 foundation with member 2 Auth and file-operations integration."""
import logging
from contextlib import asynccontextmanager
from threading import Lock

import firebase_admin
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.firebase_client import storage_enabled, storage_configured, check_storage_access
from app.firebase_admin_client import initialize_firebase
from app.routes.auth_demo import router
from app.settings import ROOT, Settings

logger = logging.getLogger(__name__)
WEB = ROOT / "frontend"


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

    application = FastAPI(title="Student File Hub — Members 1 & 2", version="1.1.0", lifespan=lifespan)
    application.state.settings = config
    application.state.firebase_app = None
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
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
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
            "storage_enabled": storage_enabled(),
            "storage_configured": storage_configured(),
            "storage_emulator_enabled": config.mode == "emulator",
            "auth_note": "Kiểm tra Email/Password trên Firebase Console khi dùng cloud; API này chỉ báo cấu hình.",
        }

    @application.get("/api/storage-check")
    def storage_check():
        if not storage_enabled():
            return {"status": "pending_blaze",
                    "message": "Kiểm tra bucket cloud đang tắt (STORAGE_ENABLED=false); demo emulator chạy riêng."}
        if config.mode == "emulator":
            return {"status": "emulator", "bucket": config.bucket,
                    "message": "Đang dùng emulator; API này không kiểm tra bucket cloud thật."}
        try:
            name = check_storage_access()
            return {"status": "ok", "bucket": name, "message": "Kết nối Cloud Storage thành công."}
        except Exception as exc:
            logger.warning("Storage connectivity check failed: %s", type(exc).__name__)
            raise HTTPException(503, "Không kết nối được Storage. Kiểm tra cấu hình, Blaze, bucket và IAM trên server.") from None

    @application.get("/api/demo-config")
    def demo_config():
        return config.public_config()

    application.include_router(router)
    application.mount("/static", StaticFiles(directory=str(WEB)), name="static")
    return application


app = create_app()
