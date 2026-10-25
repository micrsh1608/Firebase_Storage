"""Single-source Firebase configuration for both TV1 (FastAPI) and TV2 (Web SDK).

Only the Firebase Web SDK configuration is exposed via /api/demo-config.
Never return or log service account private keys or credentials.
"""
import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
EMULATOR_PROJECT = "demo-firebase-storage"


@dataclass(frozen=True)
class Settings:
    mode: str
    project_id: str
    api_key: str
    auth_domain: str
    bucket: str
    app_id: str
    storage_check_enabled: bool = False

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env", override=False)
        mode = os.getenv("DEMO_MODE", "emulator").strip().lower()
        if mode not in {"emulator", "cloud"}:
            raise ValueError("DEMO_MODE must be emulator or cloud")

        if mode == "emulator":
            project_id = os.getenv("FIREBASE_PROJECT_ID", EMULATOR_PROJECT).strip()
            if project_id != EMULATOR_PROJECT:
                raise ValueError(f"Emulator must use project {EMULATOR_PROJECT}")
            return cls(
                mode="emulator",
                project_id=project_id,
                api_key="demo-api-key",
                auth_domain=f"{project_id}.firebaseapp.com",
                bucket=f"{project_id}.firebasestorage.app",
                app_id="demo-app-id",
            )

        if any(os.getenv(k) for k in (
            "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST"
        )):
            raise ValueError("Cloud mode refuses emulator environment variables. Restart in a clean terminal.")

        required = (
            "FIREBASE_PROJECT_ID", "FIREBASE_WEB_API_KEY", "FIREBASE_AUTH_DOMAIN",
            "FIREBASE_STORAGE_BUCKET", "FIREBASE_APP_ID",
        )
        values = [os.getenv(name, "").strip() for name in required]
        missing = [key for key, value in zip(required, values)
                   if not value or value.startswith("YOUR_") or value == "..."]
        if missing:
            raise ValueError("Missing cloud configuration: " + ", ".join(missing))
        if values[0].startswith("demo-"):
            raise ValueError("Cloud mode requires a real Firebase project ID")

        enabled = os.getenv("STORAGE_ENABLED", "false").strip().lower()
        if enabled not in {"true", "false"}:
            raise ValueError("STORAGE_ENABLED must be true or false")
        return cls(mode="cloud", project_id=values[0], api_key=values[1],
                   auth_domain=values[2], bucket=values[3], app_id=values[4],
                   storage_check_enabled=(enabled == "true"))

    def public_config(self):
        """Safe-to-expose Web SDK identifiers; no backend credentials."""
        return {
            "mode": self.mode,
            "projectId": self.project_id,
            "bucket": self.bucket,
            "firebaseConfig": {
                "apiKey": self.api_key,
                "authDomain": self.auth_domain,
                "projectId": self.project_id,
                "storageBucket": self.bucket,
                "appId": self.app_id,
            },
        }
