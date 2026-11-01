"""Member 2: bridge Firebase client sign-in to a backend identity check."""
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, exceptions
from google.auth.exceptions import GoogleAuthError
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/api/auth", tags=["Authentication demo"])
bearer = HTTPBearer(auto_error=False)


async def download_user(request: Request):
    """Authenticate a native browser POST without putting ID tokens in URLs.

    HTML forms cannot set Authorization. Accept a bounded URL-encoded body
    only on the dedicated download routes, then use the same token verifier.
    """
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if not content_type:
        raise HTTPException(401, "Cần Firebase ID token", headers={"WWW-Authenticate": "Bearer"})
    if content_type != "application/x-www-form-urlencoded":
        raise HTTPException(415, "Yêu cầu tải xuống không hợp lệ.")
    origin = request.headers.get("origin")
    # Referrer-Policy: no-referrer turns native form Origin into "null".
    # Fetch Metadata still identifies a genuine same-origin browser request.
    same_origin_form = origin == "null" and request.headers.get("sec-fetch-site") == "same-origin"
    if origin and origin != str(request.base_url).rstrip("/") and not same_origin_form:
        raise HTTPException(403, "Yêu cầu tải xuống phải đến từ cùng website.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 20000:
            raise HTTPException(413, "Yêu cầu tải xuống quá lớn.")
    try:
        fields = parse_qs(body.decode("utf-8"), max_num_fields=2)
    except (UnicodeError, ValueError):
        raise HTTPException(400, "Yêu cầu tải xuống không hợp lệ.") from None
    tokens = fields.get("idToken", [])
    credential = (HTTPAuthorizationCredentials(scheme="Bearer", credentials=tokens[0])
                  if len(tokens) == 1 and tokens[0] else None)
    return await run_in_threadpool(verified_user, request, credential)


def verified_user(
    request: Request,
    credential: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if credential is None or credential.scheme.lower() != "bearer":
        raise HTTPException(401, "Cần Firebase ID token", headers={"WWW-Authenticate": "Bearer"})
    if len(credential.credentials) > 16384:
        raise HTTPException(401, "ID token không hợp lệ", headers={"WWW-Authenticate": "Bearer"})
    try:
        firebase_app = request.app.state.get_firebase_app()
    except (OSError, ValueError, exceptions.FirebaseError, GoogleAuthError):
        # Credential/configuration failures are not invalid end-user logins.
        raise HTTPException(503, "Chưa khởi tạo được Firebase Admin; kiểm tra cấu hình/credential backend") from None
    try:
        # UID comes from verified claims. Passwords never go through this endpoint.
        # Hàm này kiểm tra tính hợp lệ của Firebase ID Token, bao gồm trạng thái thu hồi được hỗ trợ bởi Admin SDK.
        return auth.verify_id_token(
            credential.credentials, app=firebase_app, check_revoked=True
        )
    except (auth.InvalidIdTokenError, auth.RevokedIdTokenError, auth.UserDisabledError,
            auth.UserNotFoundError, ValueError):
        raise HTTPException(401, "ID token hết hạn, không hợp lệ hoặc đã bị thu hồi",
                            headers={"WWW-Authenticate": "Bearer"}) from None
    except (exceptions.FirebaseError, GoogleAuthError):
        raise HTTPException(503, "Chưa xác minh được với Firebase; kiểm tra cấu hình/kết nối backend") from None


@router.get("/me")
def me(claims: dict = Depends(verified_user)):
    return {"uid": claims["uid"], "email": claims.get("email"),
            "emailVerified": claims.get("email_verified", False)}
