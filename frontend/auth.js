import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, sendEmailVerification, reload, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { auth, ready } from "./firebase-client.js";

const verificationRetry = new Map();
const RESEND_DELAY_MS = 60000;

export function getVerificationRetryAt(uid) {
  return verificationRetry.get(uid) || 0;
}

async function deliverVerification(user) {
  if (getCurrentUser() !== user) throw new Error('Phiên đăng nhập đã thay đổi.');
  if (getVerificationRetryAt(user.uid) > Date.now()) {
    throw Object.assign(new Error('Vui lòng đợi trước khi gửi lại email.'), { code: 'auth/too-many-requests' });
  }
  try {
    await sendEmailVerification(user);
  } catch (error) {
    if (error?.code === 'auth/too-many-requests') verificationRetry.set(user.uid, Date.now() + RESEND_DELAY_MS);
    throw error;
  }
  const retryAt = Date.now() + RESEND_DELAY_MS;
  verificationRetry.set(user.uid, retryAt);
  if (getCurrentUser() !== user) throw new Error('Phiên đăng nhập đã thay đổi.');
  return { retryAt };
}

export async function register(email, password) {
  const config = await ready;
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  // A mail failure must not turn a successfully created account into a failed signup.
  try {
    const delivery = await deliverVerification(credential.user);
    return { ...credential, verificationEmail: { sent: true, mode: config.mode, ...delivery } };
  } catch (error) {
    return { ...credential, verificationEmail: { sent: false, mode: config.mode, error } };
  }
}

//signInWithEmailAndPassword() là hàm của Firebase Authentication SDK.

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

//Bearer Token ở đây là bằng chứng để backend biết ai đang yêu cầu truy cập.

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


export async function sendVerification() {
  const config = await ready;
  const user = getCurrentUser();
  if (!user) throw new Error('Hãy đăng nhập trước.');
  return { mode: config.mode, ...await deliverVerification(user) };
}

export async function refreshVerification(expectedUser = null) {
  await ready;
  const user = getCurrentUser();
  if (!user || (expectedUser && expectedUser !== user)) throw new Error('Phiên đăng nhập đã thay đổi.');
  await reload(user);
  if (getCurrentUser() !== user) throw new Error('Phiên đăng nhập đã thay đổi.');
  await user.getIdToken(true);
  if (getCurrentUser() !== user) throw new Error('Phiên đăng nhập đã thay đổi.');
  return { emailVerified: user.emailVerified, email: user.email };
}


export async function resetPassword(email) {
  const config = await ready;
  const normalized = email.trim();
  // Unknown and known addresses get the same public result.
  try {
    await sendPasswordResetEmail(auth, normalized);
  } catch (error) {
    if (!['auth/user-not-found', 'auth/user-disabled'].includes(error?.code)) throw error;
  }
  return { mode: config.mode };
}
