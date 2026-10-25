"""Shared Firebase Storage adapter used by TV1's health checks.

Auth verification (TV2) and the bucket probe both use the *same* named Admin
SDK application owned by the FastAPI instance; no separate default app.
The Admin SDK bypasses client Storage Rules, so never expose unrestricted
Admin file APIs to browser users (TV3 owns backend authorization).
"""
from firebase_admin import storage


def check_storage_access(firebase_app, expected_bucket: str) -> str:
    """Verify the configured Cloud Storage bucket is reachable using the shared Admin app.

    No upload, read, download, or delete is performed. The caller decides when
    the check should run and converts setup failures to safe HTTP responses.
    """
    bucket = storage.bucket(name=expected_bucket, app=firebase_app)
    if not bucket.exists():
        raise RuntimeError("Cloud Storage bucket does not exist or cannot be accessed")
    if bucket.name != expected_bucket:
        raise RuntimeError("Unexpected Cloud Storage bucket")
    return bucket.name
