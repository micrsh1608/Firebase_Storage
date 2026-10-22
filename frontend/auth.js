import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { auth, ready } from "./firebase-client.js";

export async function register(email, password) {
  await ready;
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function login(email, password) {
  await ready;
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logout() {
  await ready;
  return signOut(auth);
}

// Subscribe after awaiting ready. Unsubscribe when a consuming view is destroyed.
export function watchAuth(callback) {
  if (!auth) throw new Error("Hãy await ready trước khi watchAuth.");
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth?.currentUser ?? null;
}

export async function verifyWithBackend() {
  await ready;
  const user = getCurrentUser();
  if (!user) throw new Error("Hãy đăng nhập trước.");
  const token = await user.getIdToken();
  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || "Backend chưa xác minh được ID token.");
  if (getCurrentUser()?.uid !== user.uid) throw new Error("Phiên đăng nhập đã thay đổi.");
  return body;
}
