import {
  ref, uploadBytesResumable, list, getMetadata, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";
import { storage } from "./firebase-client.js";
import { getCurrentUser } from "./auth.js";
import { validateFile, safeFileName, assertOwnedPath } from "./file-policy.js";

function currentUser() {
  const user = getCurrentUser();
  if (!user) throw new Error("Hãy đăng nhập trước.");
  return user;
}

function ownReference(path) {
  assertOwnedPath(currentUser().uid, path);
  return ref(storage, path);
}

// Call after ready + sign-in. Synchronous return lets the UI cancel immediately.
export function uploadFile(file, onProgress = () => {}) {
  const user = currentUser();
  validateFile(file);
  const path = `users/${user.uid}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type,
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(file.name))}`,
    cacheControl: "private, max-age=0, no-store",
  });
  const completed = new Promise((resolve, reject) => {
    task.on("state_changed", (snapshot) => {
      onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100));
    }, reject, () => resolve({ fullPath: path, name: task.snapshot.ref.name }));
  });
  return { task, completed };
}

export async function listFiles(pageToken) {
  const user = currentUser();
  const options = { maxResults: 20 };
  if (pageToken) options.pageToken = pageToken;
  const result = await list(ref(storage, `users/${user.uid}`), options);
  const files = await Promise.all(result.items.map(async (item) => {
    const metadata = await getMetadata(item);
    return { name: item.name, fullPath: item.fullPath, size: metadata.size,
      contentType: metadata.contentType, updated: metadata.updated };
  }));
  if (getCurrentUser()?.uid !== user.uid) throw new Error("Phiên đăng nhập đã thay đổi.");
  return { files, nextPageToken: result.nextPageToken || null };
}

export async function getFileURL(fullPath) {
  return getDownloadURL(ownReference(fullPath));
}

export async function removeFile(fullPath) {
  return deleteObject(ownReference(fullPath));
}
