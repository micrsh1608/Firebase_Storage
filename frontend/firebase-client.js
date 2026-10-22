// Keep all three CDN imports on the same pinned SDK version.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth, connectAuthEmulator, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";

export let auth;
export let storage;

export const ready = (async () => {
  const response = await fetch("/api/demo-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Không đọc được /api/demo-config từ FastAPI.");
  const config = await response.json();
  const app = initializeApp(config.firebaseConfig);
  auth = getAuth(app);
  storage = getStorage(app);
  if (config.mode === "emulator") {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
      throw new Error("Emulator chỉ dùng trên localhost; mở http://127.0.0.1:8000.");
    }
    // Connect before any Auth / Storage request.
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  await setPersistence(auth, browserSessionPersistence);
  return { mode: config.mode, projectId: config.projectId, bucket: config.bucket };
})();
