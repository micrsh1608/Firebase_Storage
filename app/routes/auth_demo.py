"""Member 2: bridge Firebase client sign-in to a backend identity check."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, exceptions
from google.auth.exceptions import GoogleAuthError

router = APIRouter(prefix="/api/auth", tags=["Authentication demo"])
bearer = HTTPBearer(auto_error=False)


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
