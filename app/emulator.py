"""Explicit local entry point, independent of a cloud .env configuration."""
import os

from app.settings import EMULATOR_PROJECT, ROOT

os.environ.update({
    "DEMO_MODE": "emulator",
    "FIREBASE_PROJECT_ID": EMULATOR_PROJECT,
    "STORAGE_ENABLED": "false",
    "GOOGLE_APPLICATION_CREDENTIALS": "",
    "FIREBASE_AUTH_EMULATOR_HOST": "127.0.0.1:9099",
    "FIREBASE_STORAGE_EMULATOR_HOST": "127.0.0.1:9199",
    "STORAGE_EMULATOR_HOST": "http://127.0.0.1:9199",
    # Separate local lifecycle metadata from a real cloud bucket's data.
    "FILESPACE_DATA_DIR": str(ROOT / ".data" / "emulator"),
    "FILESPACE_LOCK_DIR": str(ROOT / ".runtime" / "emulator-file-locks"),
})

from app.main import app  # noqa: E402,F401 -- environment must be set first
