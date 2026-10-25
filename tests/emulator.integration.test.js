// Real local emulator integration. Never targets production resources.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import test from 'node:test';
import { createVerificationSync } from '../frontend/verification-sync.js';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser, sendPasswordResetEmail, confirmPasswordReset, sendEmailVerification, applyActionCode, reload } from 'firebase/auth';
import { getStorage, connectStorageEmulator, ref, uploadBytes, list, getMetadata, getDownloadURL, deleteObject, updateMetadata } from 'firebase/storage';

const PROJECT = 'demo-firebase-storage', BUCKET = `${PROJECT}.firebasestorage.app`;
const PASSWORD = 'Seminar-demo-2026!';
const MAX_FILE = 10 * 1024 * 1024, MAX_USER = 50 * 1024 * 1024;
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=', 'base64'));
const PDF = new Uint8Array(readFileSync(new URL('./fixtures/preview.pdf', import.meta.url)));

function client(label) {
  const app = initializeApp({ projectId: PROJECT, storageBucket: BUCKET, apiKey: 'demo-api-key', appId: 'demo-app-id' }, `${label}-${randomUUID()}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const storage = getStorage(app); connectStorageEmulator(storage, '127.0.0.1', 9199);
  storage.maxOperationRetryTime = 1000; storage.maxUploadRetryTime = 1000;
  return { app, auth, storage };
}
const denied = operation => assert.rejects(operation, error => { assert.equal(error.code, 'storage/unauthorized'); return true; });
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); return port;
}

test('private files and enforced quotas through FastAPI and real local emulators', { timeout: 240000 }, async t => {
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099', 'Run npm run test:emulators');
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199', 'Run npm run test:emulators');
  const base = `http://127.0.0.1:${await freePort()}`;
  const lockDir = await mkdtemp(join(tmpdir(), 'filespace-phase1-'));
  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const venvPython = join(projectRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.FILESPACE_TEST_PYTHON || (existsSync(venvPython) ? venvPython : 'python');
  // Emulate standalone startup: only Firebase CLI variables are inherited.
  // The application must configure google-cloud-storage's separate endpoint.
  const childEnv = { ...process.env, DEMO_MODE: 'emulator', FIREBASE_PROJECT_ID: PROJECT, GOOGLE_APPLICATION_CREDENTIALS: '', FILESPACE_LOCK_DIR: lockDir, FILESPACE_DATA_DIR: join(lockDir, 'state') };
  delete childEnv.STORAGE_EMULATOR_HOST;
  const server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', new URL(base).port, '--log-level', 'warning'], {
    cwd: dirname(dirname(fileURLToPath(import.meta.url))), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });
  let diagnostics = '', startError;
  for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { diagnostics = (diagnostics + data).slice(-4000); });
  server.on('error', error => { startError = error; });
  let cleanupOwnedFiles = async () => {};
  const clients = [];
  t.after(async () => {
    // File cleanup needs both the server and the owner's authenticated session.
    try {
      await cleanupOwnedFiles();
    } finally {
      await Promise.allSettled(clients.map(async actor => {
        if (actor.auth.currentUser) await deleteUser(actor.auth.currentUser);
      }));
      await Promise.allSettled(clients.map(({ app }) => deleteApp(app)));
      if (server.exitCode === null && !server.killed) {
        const exited = once(server, 'exit'); server.kill();
        await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
      }
      const target = resolve(lockDir), expectedParent = resolve(tmpdir());
      assert.equal(dirname(target), expectedParent, 'Cleanup must remain inside the system temp directory');
      assert.ok(basename(target).startsWith('filespace-phase1-'), 'Cleanup must target our generated directory');
      await rm(target, { recursive: true, force: true });
    }
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startError || server.exitCode !== null) break;
    try { const response = await fetch(`${base}/health`); if (response.ok && (await response.json()).mode === 'emulator') { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Local FastAPI did not start: ${startError?.message || diagnostics}`);
  const a = client('owner'), b = client('other'), c = client('uninvited'), guest = client('guest');
  clients.push(a, b, c, guest);
  const email = `phase1-${randomUUID()}@example.test`;
  await createUserWithEmailAndPassword(a.auth, email, PASSWORD); await signOut(a.auth);
  await signInWithEmailAndPassword(a.auth, email, PASSWORD);
  await createUserWithEmailAndPassword(b.auth, `other-${randomUUID()}@example.test`, PASSWORD);
  await createUserWithEmailAndPassword(c.auth, `uninvited-${randomUUID()}@example.test`, PASSWORD);
  const uid = a.auth.currentUser.uid; assert.notEqual(b.auth.currentUser.uid, uid);
  async function api(actor, path, options = {}) {
    const headers = new Headers(options.headers);
    if (actor?.auth.currentUser) headers.set('Authorization', `Bearer ${await actor.auth.currentUser.getIdToken()}`);
    return fetch(`${base}${path}`, { ...options, headers });
  }
  const put = (actor, name, body = PDF, type = 'application/pdf') => api(actor, `/api/files?name=${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': type }, body });
  const owned = [];
  const ownedFolders = [];
  async function purgeFile(item) {
    const path = `/api/files/${encodeURIComponent(item.name)}`;
    const trashed = await api(a, `${path}/trash`, { method: 'POST' });
    assert.ok([204, 404, 409].includes(trashed.status), `Failed to trash test file (${trashed.status})`);
    return api(a, path, { method: 'DELETE' });
  }
  cleanupOwnedFiles = async () => {
    for (const item of owned) {
      const response = await purgeFile(item);
      assert.ok([204, 404].includes(response.status), `Failed to clean up test file (${response.status})`);
    }
    for (const folder of [...ownedFolders].reverse()) {
      const response = await api(a, `/api/folders/${folder.id}`, { method: 'DELETE' });
      assert.ok([204, 404].includes(response.status), 'Failed to clean up generated folder');
    }
  };

  await t.test('guest requests require auth and verified identity scopes owner metadata', async () => {
    for (const [path, method] of [['/api/files', 'GET'], ['/api/files?name=x.pdf', 'PUT'], ['/api/files/x.pdf/content', 'GET'], ['/api/files/x.pdf', 'DELETE']]) assert.equal((await api(guest, path, { method })).status, 401);
    assert.equal((await api(a, '/api/auth/me')).status, 200);
    for (const [name, bytes, type] of [['bài tập.png', PNG, 'image/png'], ['bài tập.pdf', PDF, 'application/pdf']]) {
      const response = await put(a, name, bytes, type); assert.equal(response.status, 201, await response.clone().text());
      const file = await response.json(); owned.push(file);
      assert.ok(file.fullPath.startsWith(`users/${uid}/`)); assert.equal(file.size, bytes.length); assert.equal(file.contentType, type);
      assert.ok(!JSON.stringify(file).includes('token='));
    }
    const listing = await (await api(a, '/api/files')).json();
    assert.equal(listing.files.length, 2); assert.equal(listing.usage.usedBytes, PNG.length + PDF.length);
    assert.equal(listing.usage.maxBytes, MAX_USER); assert.equal(listing.usage.maxFileBytes, MAX_FILE);
    const other = await (await api(b, `/api/files?uid=${uid}`)).json(); assert.deepEqual(other.files, []); assert.equal(other.usage.usedBytes, 0);
  });
  await t.test('owner download works while other-user, guest and raw Storage download fail', async () => {
    const file = owned[0], path = `/api/files/${encodeURIComponent(file.name)}/content`;
    const response = await api(a, path); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment/); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
    assert.equal((await api(b, path)).status, 404); assert.equal((await api(guest, path)).status, 401);
    assert.equal((await api(b, `/api/files/${encodeURIComponent(file.name)}`, { method: 'DELETE' })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(file.fullPath)}?alt=media`)).status, 403);
  });
  await t.test('direct Storage SDK operations cannot bypass gateway even for the owner', async () => {
    const path = owned[0].fullPath;
    for (const actor of [a, b, guest]) {
      await denied(() => getMetadata(ref(actor.storage, path))); await denied(() => getDownloadURL(ref(actor.storage, path)));
      await denied(() => list(ref(actor.storage, `users/${uid}`), { maxResults: 20 }));
      await denied(() => uploadBytes(ref(actor.storage, `users/${uid}/bypass-${randomUUID()}.png`), PNG, { contentType: 'image/png' }));
      await denied(() => updateMetadata(ref(actor.storage, path), { customMetadata: { changed: 'true' } }));
      await denied(() => deleteObject(ref(actor.storage, path)));
    }
  });
  await t.test('server rejects invalid type, signature, empty and oversize without consuming quota', async () => {
    const before = await (await api(a, '/api/files')).json();
    for (const [name, bytes, type, status] of [['bad.html', PNG, 'text/html', 415], ['empty.pdf', new Uint8Array(0), 'application/pdf', 400], ['spoof.pdf', PNG, 'application/pdf', 415], ['large.pdf', new Uint8Array(MAX_FILE + 1), 'application/pdf', 413]]) {
      const response = await put(a, name, bytes, type); assert.equal(response.status, status, await response.clone().text());
    }
    const after = await (await api(a, '/api/files')).json(); assert.equal(after.usage.usedBytes, before.usage.usedBytes); assert.equal(after.files.length, before.files.length);
  });
  await t.test('owner shares with B, denies C, revokes, trashes and restores privately', async () => {
    const file = owned[1], path = `/api/files/${encodeURIComponent(file.name)}`;
    const sharedPath = `/api/files/shared/${uid}/${encodeURIComponent(file.name)}/content`;
    const grant = email => api(a, `${path}/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    assert.equal((await api(a, path, { method: 'DELETE' })).status, 409, 'Active files must first enter trash');
    assert.equal((await grant(email)).status, 400, 'Self-share must be rejected');
    assert.equal((await grant(`missing-${randomUUID()}@example.test`)).status, 404);
    assert.equal((await grant(b.auth.currentUser.email)).status, 201);
    assert.equal((await grant(b.auth.currentUser.email)).status, 201, 'Duplicate grant is idempotent');
    const grants = await (await api(a, `${path}/shares`)).json(); assert.equal(grants.shares.length, 1);
    const shared = await (await api(b, '/api/files/shared-with-me')).json();
    assert.equal(shared.files.length, 1); assert.equal(shared.files[0].ownerUid, uid);
    assert.equal(shared.usage.usedBytes, 0);
    const download = await api(b, sharedPath); assert.equal(download.status, 200);
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), PDF);
    assert.equal((await api(c, sharedPath)).status, 404); assert.equal((await api(guest, sharedPath)).status, 401);
    for (const [method, suffix, body] of [
      ['GET', '/shares'], ['POST', '/shares', { email: c.auth.currentUser.email }],
      ['DELETE', `/shares/${b.auth.currentUser.uid}`], ['POST', '/trash'], ['POST', '/restore'], ['DELETE', ''],
    ]) {
      const options = { method };
      if (body) { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body); }
      assert.equal((await api(b, path + suffix, options)).status, 404);
    }
    assert.equal((await api(a, `${path}/shares/${b.auth.currentUser.uid}`, { method: 'DELETE' })).status, 204);
    assert.equal((await api(b, sharedPath)).status, 404);
    assert.equal((await (await api(b, '/api/files/shared-with-me')).json()).files.length, 0);
    assert.equal((await grant(b.auth.currentUser.email)).status, 201);
    const before = (await (await api(a, '/api/files')).json()).usage;
    assert.equal((await api(a, `${path}/trash`, { method: 'POST' })).status, 204);
    assert.equal((await api(a, `${path}/content`)).status, 404);
    assert.equal((await api(b, sharedPath)).status, 404);
    assert.equal((await grant(b.auth.currentUser.email)).status, 404);
    const trash = await (await api(a, '/api/files/trash')).json();
    assert.equal(trash.files.length, 1); assert.deepEqual(trash.usage, before);
    assert.equal((await api(a, `${path}/restore`, { method: 'POST' })).status, 204);
    assert.equal((await api(a, `${path}/content`)).status, 200);
    assert.equal((await api(b, sharedPath)).status, 404, 'Restoring must not restore old shares');
    assert.equal((await (await api(a, `${path}/shares`)).json()).shares.length, 0);
    assert.equal((await (await api(a, '/api/files/trash')).json()).files.length, 0);
  });
  await t.test('folders, stable rename and move, global search and authenticated preview', async () => {
    async function folder(name, parentId = null) {
      const response = await api(a, '/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parentId }) });
      assert.equal(response.status, 201); const item = await response.json(); ownedFolders.push(item); return item;
    }
    const root = await folder('Seminar'), child = await folder('Documents', root.id);
    const file = owned[1], path = `/api/files/${encodeURIComponent(file.name)}`;
    const before = (await (await api(a, '/api/files')).json()).usage;
    const grant = await api(a, `${path}/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: b.auth.currentUser.email }) });
    assert.equal(grant.status, 201);
    const changed = await api(a, path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Renamed Report.pdf', folderId: child.id }) });
    assert.equal(changed.status, 200); const item = await changed.json();
    assert.equal(item.name, file.name); assert.equal(item.fullPath, file.fullPath); assert.equal(item.folderId, child.id);
    assert.equal(item.displayName, 'Renamed Report.pdf');
    const found = await (await api(a, '/api/files?q=renamed%20report&type=pdf')).json();
    assert.equal(found.total, 1); assert.equal(found.files[0].name, file.name);
    const inFolder = await (await api(a, `/api/files?scope=folder&folderId=${child.id}`)).json();
    assert.equal(inFolder.total, 1); assert.deepEqual(inFolder.usage, before);
    const folderListing = await (await api(a, `/api/folders?parentId=${child.id}`)).json();
    assert.deepEqual(folderListing.breadcrumbs.map(item => item.name), ['Seminar', 'Documents']);
    assert.equal((await api(b, `/api/folders?parentId=${child.id}`)).status, 404);
    assert.equal((await api(b, path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'stolen.pdf' }) })).status, 404);
    const sharedPreviewPath = `/api/files/shared/${uid}/${encodeURIComponent(file.name)}/preview`;
    for (const [actor, previewPath] of [[a, `${path}/preview`], [b, sharedPreviewPath]]) {
      const preview = await api(actor, previewPath); assert.equal(preview.status, 200);
      assert.equal(preview.headers.get('content-type').split(';')[0], 'application/pdf');
      assert.match(preview.headers.get('content-disposition'), /^inline;/);
      assert.match(preview.headers.get('content-security-policy'), /sandbox/);
      assert.equal(preview.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), PDF);
    }
    assert.equal((await api(c, sharedPreviewPath)).status, 404);
    assert.equal((await api(guest, `${path}/preview`)).status, 401);
    assert.equal((await api(a, `/api/folders/${root.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: child.id }) })).status, 409);
    assert.equal((await api(a, `/api/folders/${child.id}`, { method: 'DELETE' })).status, 409);
    assert.equal((await api(a, path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderId: null }) })).status, 200);
    assert.equal((await api(a, `${path}/shares/${b.auth.currentUser.uid}`, { method: 'DELETE' })).status, 204);
    assert.equal((await api(b, sharedPreviewPath)).status, 404);
    assert.equal((await api(a, `/api/folders/${child.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await api(a, `/api/folders/${root.id}`, { method: 'DELETE' })).status, 204);
  });
  await t.test('pagination covers 21 files and quota usage covers every page', async () => {
    for (let index = 0; index < 19; index++) { const response = await put(a, `page-${index}.pdf`); assert.equal(response.status, 201, await response.clone().text()); owned.push(await response.json()); }
    const first = await (await api(a, '/api/files')).json(); assert.equal(first.files.length, 20); assert.ok(first.nextPageToken);
    const second = await (await api(a, `/api/files?pageToken=${encodeURIComponent(first.nextPageToken)}`)).json(); assert.equal(second.files.length, 1); assert.equal(second.nextPageToken, null);
    assert.deepEqual(new Set([...first.files, ...second.files].map(item => item.fullPath)), new Set(owned.map(item => item.fullPath)));
    assert.equal(first.usage.usedBytes, PNG.length + 20 * PDF.length); assert.deepEqual(first.usage, second.usage);
    for (const file of owned.splice(0)) assert.equal((await purgeFile(file)).status, 204);
    assert.equal((await (await api(a, '/api/files')).json()).usage.usedBytes, 0);
  });
  await t.test('aggregate quota withstands concurrent upload and deletion frees space for retry', async () => {
    for (let index = 0; index < 5; index++) {
      const bytes = new Uint8Array(index === 4 ? MAX_FILE - 1024 : MAX_FILE); bytes.set(PDF);
      const response = await put(a, `quota-${index}.pdf`, bytes); assert.equal(response.status, 201, await response.clone().text()); owned.push(await response.json());
    }
    const chunk = new Uint8Array(1024); chunk.set(PDF);
    const races = await Promise.all([put(a, 'race-a.pdf', chunk), put(a, 'race-b.pdf', chunk)]);
    assert.deepEqual(races.map(response => response.status).sort(), [201, 409]);
    for (const response of races) if (response.status === 201) owned.push(await response.json());
    assert.equal((await (await api(a, '/api/files')).json()).usage.usedBytes, MAX_USER);
    const removed = owned.pop();
    assert.equal((await api(a, `/api/files/${encodeURIComponent(removed.name)}/trash`, { method: 'POST' })).status, 204);
    assert.equal((await put(a, 'trash-does-not-free-quota.pdf', chunk)).status, 409);
    assert.equal((await purgeFile(removed)).status, 204);
    const retry = await put(a, 'retry-after-delete.pdf', chunk); assert.equal(retry.status, 201, await retry.clone().text()); owned.push(await retry.json());
    assert.equal((await api(a, `/api/files/${encodeURIComponent(removed.name)}/content`)).status, 404);
  });
  await t.test('email verification is detected automatically after applying local OOB action', async () => {
    const user = b.auth.currentUser;
    assert.equal(user.emailVerified, false);
    let lastRefresh = Promise.resolve(), checks = 0, notified = 0, claims;
    const timers = new Map(); let nextTimer = 0;
    const sync = createVerificationSync({
      getUser: () => b.auth.currentUser,
      refresh: expected => {
        lastRefresh = (async () => {
          assert.equal(expected, user);
          checks += 1;
          await reload(user);
          const token = await user.getIdToken(true);
          claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
          return { emailVerified: user.emailVerified, email: user.email };
        })();
        return lastRefresh;
      },
      onVerified: () => { notified += 1; },
      onError: () => assert.fail('Local verification refresh should succeed'),
      isVisible: () => true,
      schedule: (callback, delay) => { const id = ++nextTimer; timers.set(id, callback); return id; },
      clear: id => timers.delete(id), intervalMs: 5000,
    });
    try {
      await sync.start(user);
      assert.equal(checks, 1); assert.equal(notified, 0); assert.equal(timers.size, 1);
      await sendEmailVerification(user);
      const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      const action = payload.oobCodes.filter(item => item.email === user.email && item.requestType === 'VERIFY_EMAIL').at(-1);
      assert.ok(action, 'Expected an emulator verification action');
      await applyActionCode(b.auth, action.oobCode);
      const [id, callback] = timers.entries().next().value; timers.delete(id); callback();
      await Promise.resolve(); // Allow the scheduled controller check to start refresh.
      await lastRefresh;
      for (let index = 0; index < 8; index++) await Promise.resolve();
      assert.equal(user.emailVerified, true); assert.equal(claims.email_verified, true);
      assert.equal(notified, 1); assert.equal(timers.size, 0);
    } finally { sync.stop(); }
  });
  await t.test('local password recovery replaces old password without exposing reset codes', async () => {
    await sendPasswordResetEmail(a.auth, email);
    const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const reset = payload.oobCodes.filter(item => item.email === email && item.requestType === 'PASSWORD_RESET').at(-1);
    assert.ok(reset, 'Expected a local password reset operation');
    const replacement = 'Seminar-reset-2026!';
    await confirmPasswordReset(a.auth, reset.oobCode, replacement);
    await signOut(a.auth);
    await assert.rejects(() => signInWithEmailAndPassword(a.auth, email, PASSWORD), error => {
      assert.ok(['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(error.code)); return true;
    });
    await signInWithEmailAndPassword(a.auth, email, replacement);
    assert.equal(a.auth.currentUser.uid, uid);
    assert.equal((await api(a, '/api/files')).status, 200);
  });

});




