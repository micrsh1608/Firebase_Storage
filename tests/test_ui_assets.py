"""Ensure that styles & scripts bundled with the HTML are served by FastAPI.

The browser screenshot showed huge SVG icons because the stylesheet was not applied.
"""
import re
from fastapi.testclient import TestClient
from app.main import create_app
from app.settings import Settings


def test_root_serves_real_styles_and_scripts():
    settings = Settings(
        mode="emulator", project_id="demo-firebase-storage", api_key="demo-api-key",
        auth_domain="demo-firebase-storage.firebaseapp.com",
        bucket="demo-firebase-storage.firebasestorage.app", app_id="demo-app-id",
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        home = client.get("/")
        assert home.status_code == 200
        assert home.headers["cache-control"] == "no-store"
        css_match = re.search(r'<link[^>]+href="([^"]+styles\.css[^"]*)"', home.text)
        js_match = re.search(r'<script[^>]+src="([^"]+ui\.js[^"]*)"', home.text)
        assert css_match and js_match
        styles = client.get(css_match.group(1))
        script = client.get(js_match.group(1))
        assert styles.status_code == 200
        assert script.status_code == 200
        assert "text/css" in styles.headers["content-type"]
        assert "javascript" in script.headers["content-type"]
        assert re.search(r"\.icon\s*\{[^}]*width:\s*18px", styles.text)
        assert re.search(r"\.app-shell\s*\{[^}]*min-height:\s*100vh", styles.text)
        assert "function updateControls()" in script.text
        assert styles.headers["cache-control"] == "no-cache, must-revalidate"


def test_pdf_viewer_modules_have_executable_mime_on_windows():
    settings = Settings("emulator", "demo-firebase-storage", "demo-api-key",
                        "demo-firebase-storage.firebaseapp.com",
                        "demo-firebase-storage.firebasestorage.app", "demo-app-id")
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        for name in ("pdf.min.mjs", "pdf.worker.min.mjs"):
            response = client.get("/static/vendor/pdfjs/" + name)
            assert response.status_code == 200
            assert "javascript" in response.headers["content-type"]
        assert client.get("/static/pdf-preview.js").status_code == 200
