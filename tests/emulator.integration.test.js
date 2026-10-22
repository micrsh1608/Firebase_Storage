// Real Firebase Emulator Suite integration. Start with npm run test:emulators.
// These checks exercise the JS SDK and storage.rules, not frontend validation.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import {
  getStorage, connectStorageEmulator, ref, uploadBytes, list,
  getMetadata, getDownloadURL, deleteObject, updateMetadata,
} from "firebase/storage";

const PROJECT = "demo-firebase-storage";
const BUCKET = `${PROJECT}.firebasestorage.app`;
const PASSWORD = "Seminar-demo-2026!";
const PNG = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=", "base64"));
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

function client(label) {
  const app = initializeApp({ projectId: PROJECT, storageBucket: BUCKET,
    apiKey: "demo-api-key", appId: "demo-app-id" }, `${label}-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const storage = getStorage(app);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  storage.maxOperationRetryTime = 5000;
  storage.maxUploadRetryTime = 5000;
  return { app, auth, storage };
}

const denied = (operation) => assert.rejects(operation, (error) => {
  assert.equal(error.code, "storage/unauthorized");
  return true;
});

test("Auth + Storage lifecycle and Rules against local emulators", { timeout: 120000 }, async (t) => {
  const a = client("owner"), b = client("other"), guest = client("guest");
  t.after(async () => {
    await Promise.all([a, b, guest].map(({ app }) => deleteApp(app)));
  });
  const email = `member2-${randomUUID()}@example.test`;
  let uid, imagePath, pdfPath, authReady = false;
  const ownedPaths = [];

  await t.test("register, sign out and sign in with an ID token", async () => {
    const created = await createUserWithEmailAndPassword(a.auth, email, PASSWORD);
    uid = created.user.uid;
    assert.equal(a.auth.currentUser.uid, uid);
    await signOut(a.auth);
    assert.equal(a.auth.currentUser, null);
    const signedIn = await signInWithEmailAndPassword(a.auth, email, PASSWORD);
    assert.equal(signedIn.user.uid, uid);
    const token = await signedIn.user.getIdToken();
    assert.equal(token.split(".").length, 3);
    // Do not print tokens to test output.
    await createUserWithEmailAndPassword(b.auth, `other-${randomUUID()}@example.test`, PASSWORD);
    assert.notEqual(b.auth.currentUser.uid, uid);
    imagePath = `users/${uid}/01-${randomUUID()}.png`;
    pdfPath = `users/${uid}/02-${randomUUID()}.pdf`;
    authReady = true;
  });

  // Stop dependent groups after a failed Auth setup instead of cascading errors.
  assert.ok(authReady, "Auth setup must finish before Storage checks");

  await t.test("uploads image/PDF metadata and paginates 21 files as 20 + 1", async () => {
    for (const [path, bytes, contentType] of [[imagePath, PNG, "image/png"], [pdfPath, PDF, "application/pdf"]]) {
      const result = await uploadBytes(ref(a.storage, path), bytes, { contentType });
      ownedPaths.push(path);
      assert.equal(result.ref.fullPath, path);
      const metadata = await getMetadata(result.ref);
      assert.equal(metadata.contentType, contentType);
      assert.equal(metadata.size, bytes.byteLength);
    }
    for (let index = 0; index < 19; index++) {
      const path = `users/${uid}/page-${String(index).padStart(2, "0")}-${randomUUID()}.png`;
      await uploadBytes(ref(a.storage, path), PNG, { contentType: "image/png" });
      ownedPaths.push(path);
    }
    const prefix = ref(a.storage, `users/${uid}`);
    const first = await list(prefix, { maxResults: 20 });
    assert.equal(first.items.length, 20);
    assert.ok(first.nextPageToken);
    const second = await list(prefix, { maxResults: 20, pageToken: first.nextPageToken });
    assert.equal(second.items.length, 1);
    assert.ok(!second.nextPageToken);
    assert.deepEqual(new Set([...first.items, ...second.items].map((item) => item.fullPath)), new Set(ownedPaths));
  });

  await t.test("download token URL serves the original bytes after sign-out", async () => {
    const url = await getDownloadURL(ref(a.storage, imagePath));
    const parsed = new URL(url);
    assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname), "Never download a production object");
    assert.equal(parsed.port, "9199");
    assert.ok(parsed.searchParams.get("token"), "Expected a shareable download token");
    await signOut(a.auth);
    assert.equal(a.auth.currentUser, null);
    const response = await fetch(url); // Deliberately no Authorization header.
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
    await signInWithEmailAndPassword(a.auth, email, PASSWORD);
  });

  await t.test("Rules deny guest/other-user SDK operations and invalid owner uploads", async () => {
    for (const actor of [guest, b]) {
      await denied(() => getMetadata(ref(actor.storage, imagePath)));
      await denied(() => getDownloadURL(ref(actor.storage, imagePath)));
      await denied(() => list(ref(actor.storage, `users/${uid}`), { maxResults: 20 }));
      await denied(() => uploadBytes(ref(actor.storage, `users/${uid}/intruder-${randomUUID()}.png`), PNG,
        { contentType: "image/png" }));
      await denied(() => deleteObject(ref(actor.storage, imagePath)));
    }
    for (const [label, bytes, contentType] of [
      ["type", PNG, "text/html"], ["empty", new Uint8Array(0), "image/png"],
      ["large", new Uint8Array(5 * 1024 * 1024 + 1), "application/pdf"],
    ]) {
      await denied(() => uploadBytes(ref(a.storage, `users/${uid}/${label}-${randomUUID()}`), bytes, { contentType }));
    }
    const existing = ref(a.storage, imagePath);
    const before = await getMetadata(existing);
    // Both are valid uploads by size/type; only the existing path must deny them.
    await denied(() => uploadBytes(existing, PNG, { contentType: "image/png" }));
    await denied(() => uploadBytes(existing, PDF, { contentType: "application/pdf" }));
    await denied(() => updateMetadata(existing, { customMetadata: { changed: "true" } }));
    const after = await getMetadata(existing);
    assert.equal(after.size, PNG.byteLength);
    assert.equal(after.contentType, "image/png");
    assert.equal(after.generation, before.generation);
    assert.equal(after.md5Hash, before.md5Hash);
    const originalURL = await getDownloadURL(existing);
    const originalURLParts = new URL(originalURL);
    assert.ok(["127.0.0.1", "localhost"].includes(originalURLParts.hostname));
    assert.equal(originalURLParts.port, "9199");
    const originalResponse = await fetch(originalURL);
    assert.equal(originalResponse.status, 200);
    assert.deepEqual(new Uint8Array(await originalResponse.arrayBuffer()), PNG);
  });

  await t.test("owner deletes files, then SDK reads report object-not-found", async () => {
    for (const path of ownedPaths) await deleteObject(ref(a.storage, path));
    await assert.rejects(() => getMetadata(ref(a.storage, imagePath)), { code: "storage/object-not-found" });
    await assert.rejects(() => getDownloadURL(ref(a.storage, pdfPath)), { code: "storage/object-not-found" });
    assert.equal((await list(ref(a.storage, `users/${uid}`), { maxResults: 20 })).items.length, 0);
    await signOut(a.auth);
    assert.equal(a.auth.currentUser, null);
  });
});
