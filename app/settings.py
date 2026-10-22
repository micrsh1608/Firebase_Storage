"""Public web config and local/cloud mode. No credential is returned to the browser."""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    mode: str
    project_id: str
    api_key: str
    auth_domain: str
    bucket: str
    app_id: str

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env", override=False)
        mode = os.getenv("DEMO_MODE", "emulator").strip()
        if mode not in {"emulator", "cloud"}:
            raise ValueError("DEMO_MODE must be emulator or cloud")
        if mode == "emulator":
            project = os.getenv("FIREBASE_PROJECT_ID", "demo-firebase-storage").strip()
            if project != "demo-firebase-storage":
                raise ValueError("Local demo uses demo-firebase-storage; match firebase.json / npm run emulators")
            return cls(mode, project, "demo-api-key", f"{project}.firebaseapp.com",
                       f"{project}.firebasestorage.app", "demo-app-id")
        if any(os.getenv(key) for key in ("FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST")):
            raise ValueError("Cloud mode refuses emulator environment variables. Remove them and restart.")
        keys = ("FIREBASE_PROJECT_ID", "FIREBASE_WEB_API_KEY", "FIREBASE_AUTH_DOMAIN",
                "FIREBASE_STORAGE_BUCKET", "FIREBASE_APP_ID")
        values = [os.getenv(key, "").strip() for key in keys]
        missing = [key for key, value in zip(keys, values) if not value or value.startswith("YOUR_")]
        if missing:
            raise ValueError("Missing cloud configuration: " + ", ".join(missing))
        if values[0].startswith("demo-"):
            raise ValueError("Cloud mode requires a real Firebase project ID")
        return cls(mode, *values)

    def public_config(self):
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
