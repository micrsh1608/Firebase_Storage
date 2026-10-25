"""Revoke legacy bearer download links without deleting files.

Dry run:
    python -m scripts.revoke_legacy_tokens
Explicit write, only to the configured project:
    python -m scripts.revoke_legacy_tokens --apply --project demo-firebase-storage

Only metadata.firebaseStorageDownloadTokens is removed. Existing downloaded
copies cannot be recalled. Run once before relying on private gateway downloads
for a bucket that previously used Firebase getDownloadURL().
"""
import argparse
import json
import sys

import firebase_admin
from firebase_admin import storage
from google.api_core.exceptions import PreconditionFailed

from app.firebase_admin_client import initialize_firebase
from app.settings import Settings

TOKEN_METADATA_KEY = "firebaseStorageDownloadTokens"


def revoke_legacy_tokens(bucket, apply=False):
    """Return safe aggregate counts; never print token values or object names.

    List failures propagate to the CLI as a safe nonzero result. Individual
    object conflicts/errors are counted so an interrupted migration is visible.
    Metageneration guards prevent overwriting concurrent metadata updates.
    """
    counts = {"scanned": 0, "matched": 0, "revoked": 0, "conflicts": 0, "failed": 0}
    for blob in bucket.list_blobs(prefix="users/", timeout=30):
        counts["scanned"] += 1
        original_metadata = dict(blob.metadata or {})
        if TOKEN_METADATA_KEY not in original_metadata:
            continue
        counts["matched"] += 1
        if not apply:
            continue
        metageneration = blob.metageneration
        if metageneration is None:
            counts["failed"] += 1
            continue
        updated_metadata = dict(original_metadata)
        # GCS PATCH merges metadata maps: omitting the old key would leave its
        # token active. Explicit JSON null deletes this key on the server.
        updated_metadata[TOKEN_METADATA_KEY] = None
        try:
            blob.metadata = updated_metadata
            blob.patch(if_metageneration_match=metageneration, timeout=30)
        except PreconditionFailed:
            blob.metadata = original_metadata
            counts["conflicts"] += 1
        except Exception:
            blob.metadata = original_metadata
            counts["failed"] += 1
        else:
            counts["revoked"] += 1
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description="Inspect or revoke legacy Firebase download tokens.")
    parser.add_argument("--apply", action="store_true", help="Remove legacy download-token metadata.")
    parser.add_argument("--project", help="Must exactly match the configured project before writes.")
    args = parser.parse_args(argv)
    if args.apply and not args.project:
        parser.error("--apply requires --project matching the configured Firebase project.")
    try:
        settings = Settings.from_env()
    except Exception:
        print("Không đọc được cấu hình Firebase. Không có thay đổi nào được thực hiện.", file=sys.stderr)
        return 1
    if args.project is not None and args.project != settings.project_id:
        parser.error("--project does not match the configured Firebase project. No writes performed.")

    firebase_app = None
    try:
        firebase_app = initialize_firebase(settings)
        bucket = storage.bucket(name=settings.bucket, app=firebase_app)
        counts = revoke_legacy_tokens(bucket, apply=args.apply)
        print(json.dumps({"mode": "apply" if args.apply else "dry-run", **counts}, sort_keys=True))
        return 1 if counts["conflicts"] or counts["failed"] else 0
    except Exception:
        # Upstream exception messages may contain signed URLs or object names.
        print("Không hoàn tất kiểm tra/thu hồi liên kết. Chạy lại dry-run để kiểm tra.", file=sys.stderr)
        return 1
    finally:
        if firebase_app is not None:
            firebase_admin.delete_app(firebase_app)


if __name__ == "__main__":
    raise SystemExit(main())
