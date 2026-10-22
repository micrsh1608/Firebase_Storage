"""Minimal member-1 adapter for a standalone demo; reuse the team's Admin app when merging."""
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials
from google.auth.credentials import AnonymousCredentials

from app.settings import ROOT, Settings


class _EmulatorCredential(credentials.Base):
    def get_credential(self):
        return AnonymousCredentials()


def initialize_firebase(settings: Settings):
    if settings.mode == "emulator":
        # Unsigned emulator tokens are accepted ONLY in this explicit local mode.
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
        os.environ["FIREBASE_STORAGE_EMULATOR_HOST"] = "127.0.0.1:9199"
        credential = _EmulatorCredential()
    else:
        if os.getenv("FIREBASE_AUTH_EMULATOR_HOST") or os.getenv("FIREBASE_STORAGE_EMULATOR_HOST"):
            raise ValueError("Emulator environment variables must never be enabled in cloud mode")
        # Resolve a team's relative key path from the project, or use ADC/workload identity.
        key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if key_path:
            path = Path(key_path)
            if not path.is_absolute():
                path = ROOT / path
            credential = credentials.Certificate(str(path))
        else:
            credential = credentials.ApplicationDefault()
    return firebase_admin.initialize_app(
        credential,
        {"projectId": settings.project_id, "storageBucket": settings.bucket},
        name="member2-demo",
    )
