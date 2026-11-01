"""Start Auth/Storage Emulator and FastAPI together, with no cloud credentials."""
import argparse
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]


def start(command, options):
    # Pipes preserve emulator output (including local verification links) even
    # when Windows children run without their own visible console window.
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, encoding="utf-8", errors="replace", **options)
    def forward_output():
        for line in process.stdout:
            print(line, end="", flush=True)
    Thread(target=forward_output, daemon=True).start()
    return process


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return True
    except OSError:
        return False


def stop(process):
    if process is not None and process.poll() is None:
        if os.name == "nt":
            # TerminateProcess alone leaves the CLI's Java child running.
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, check=False)
        else:
            process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-only", action="store_true", help="Connect to emulators already started with npm run emulators")
    args = parser.parse_args()
    local_python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    python = str(local_python) if local_python.exists() else sys.executable
    cli = ROOT / "node_modules/firebase-tools/lib/bin/firebase.js"
    env = dict(os.environ)
    # The child app also enforces these settings before loading .env.
    env.update(DEMO_MODE="emulator", FIREBASE_PROJECT_ID="demo-firebase-storage", GOOGLE_APPLICATION_CREDENTIALS="")
    if env.get("JAVA_HOME"):
        env["PATH"] = str(Path(env["JAVA_HOME"]) / "bin") + os.pathsep + env.get("PATH", "")
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    options = {"cwd": ROOT, "env": env}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NO_WINDOW
    emulator = server = None
    try:
        if not args.api_only:
            if not cli.is_file():
                raise RuntimeError("Missing Firebase CLI. Run npm ci first.")
            occupied = [p for p in (8000, 9099, 9199, 4000) if port_open(p)]
            if occupied:
                raise RuntimeError(f"Ports already in use: {occupied}. Stop the old services, or use --api-only for existing emulators.")
            emulator = start(["node", str(cli), "emulators:start", "--only", "auth,storage", "--project", "demo-firebase-storage"], options)
        deadline = time.monotonic() + (10 if args.api_only else 90)
        while not all(port_open(p) for p in (9099, 9199)):
            if emulator is not None and emulator.poll() is not None:
                raise RuntimeError("Firebase Emulator stopped. Check Node.js, Java and the log above.")
            if time.monotonic() > deadline:
                raise RuntimeError("Auth/Storage emulators are not ready on ports 9099/9199.")
            time.sleep(0.25)
        server = start([python, "-m", "uvicorn", "app.emulator:app", "--host", "127.0.0.1", "--port", "8000"], options)
        print("FileSpace: http://127.0.0.1:8000 | Emulator UI: http://127.0.0.1:4000", flush=True)
        while server.poll() is None:
            if emulator is not None and emulator.poll() is not None:
                raise RuntimeError("Firebase Emulator stopped; shutting down the local API.")
            time.sleep(0.5)
        return server.returncode
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError) as exc:
        print(f"Emulator startup failed: {exc}", file=sys.stderr)
        return 1
    finally:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        stop(server)
        stop(emulator)


if __name__ == "__main__":
    raise SystemExit(main())
