// Deterministic verification polling behavior; no browser, Firebase or real timers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationSync } from '../frontend/verification-sync.js';

const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(customRefresh = async () => ({ emailVerified: false })) {
  let current = { uid: 'alice', email: 'alice@example.test', emailVerified: false };
  let visible = true, next = 0;
  const timers = new Map(), delays = [], verified = [], errors = [], refreshes = [];
  const sync = createVerificationSync({
    getUser: () => current,
    refresh: async () => {
      const captured = current;
      refreshes.push(captured);
      const result = await customRefresh(captured, refreshes.length);
      if (result && Object.hasOwn(result, 'emailVerified')) captured.emailVerified = result.emailVerified;
      return result;
    },
    onVerified: (...args) => verified.push(args),
    onError: (...args) => errors.push(args),
    isVisible: () => visible,
    schedule(callback, delay) { const id = ++next; timers.set(id, callback); delays.push(delay); return id; },
    clear(id) { timers.delete(id); },
    intervalMs: 5000,
  });
  return {
    sync, timers, delays, verified, errors, refreshes,
    get user() { return current; }, set user(value) { current = value; },
    set visible(value) { visible = value; },
    fire() { assert.ok(timers.size, 'Expected an automatic check to be scheduled'); const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
    async begin() { sync.start(current); await settle(); if (!refreshes.length && timers.size) { this.fire(); await settle(); } },
  };
}

test('automatically detects verified email without a manual refresh action', async () => {
  let serverVerified = false;
  const h = harness(async () => ({ emailVerified: serverVerified, email: 'alice@example.test' }));
  await h.begin();
  assert.equal(h.verified.length, 0);
  assert.ok(h.timers.size);
  serverVerified = true;
  h.fire(); await settle();
  assert.equal(h.user.emailVerified, true);
  assert.equal(h.verified.length, 1);
  assert.equal(h.timers.size, 0);
  const requests = h.refreshes.length;
  await h.sync.check(); await settle();
  assert.equal(h.refreshes.length, requests);
  assert.equal(h.verified.length, 1);
});

test('logout cancels scheduled work and ignores a refresh that completes later', async () => {
  const pending = deferred();
  const h = harness(async () => pending.promise);
  await h.begin();
  assert.equal(h.refreshes.length, 1);
  h.user = null;
  h.sync.stop();
  pending.resolve({ emailVerified: true }); await settle();
  assert.equal(h.verified.length, 0);
  assert.equal(h.errors.length, 0);
  assert.equal(h.timers.size, 0);
});

test('a new user object with the same UID fences stale verification completion', async () => {
  const old = deferred();
  let latestVerified = false;
  const h = harness(async (user, call) => call === 1 ? old.promise : { emailVerified: latestVerified });
  await h.begin();
  const previous = h.user;
  h.user = { uid: previous.uid, email: previous.email, emailVerified: false };
  h.sync.start(h.user);
  await settle();
  old.resolve({ emailVerified: true }); await settle();
  assert.equal(h.verified.length, 0);
  assert.equal(h.user.emailVerified, false);
  latestVerified = true;
  if (h.timers.size) h.fire(); else void h.sync.check();
  await settle();
  assert.equal(h.verified.length, 1);
  assert.equal(h.timers.size, 0);
});

test('concurrent focus and polling checks do not overlap network refreshes', async () => {
  const pending = deferred();
  const h = harness(async () => pending.promise);
  await h.begin();
  const checks = [h.sync.check(), h.sync.check(), h.sync.check()];
  await settle();
  assert.equal(h.refreshes.length, 1);
  pending.resolve({ emailVerified: false });
  await Promise.all(checks); await settle();
  assert.equal(h.refreshes.length, 1);
  assert.equal(h.timers.size, 1);
  h.sync.stop();
});

test('hidden pages skip Firebase requests until a visibility event checks again', async () => {
  const h = harness(async () => ({ emailVerified: true }));
  h.visible = false;
  await h.begin();
  assert.equal(h.refreshes.length, 0);
  assert.equal(h.verified.length, 0);
  assert.equal(h.timers.size, 0);
  h.visible = true;
  await h.sync.check(); await settle();
  assert.equal(h.refreshes.length, 1);
  assert.equal(h.verified.length, 1);
  assert.equal(h.timers.size, 0);
});

test('temporary refresh failure reports once and retries on the next scheduled check', async () => {
  const h = harness(async (user, call) => {
    if (call === 1) throw new Error('Temporary connection failure');
    return { emailVerified: true };
  });
  await h.begin();
  assert.equal(h.errors.length, 1);
  assert.equal(h.verified.length, 0);
  assert.equal(h.timers.size, 1);
  h.fire(); await settle();
  assert.equal(h.refreshes.length, 2);
  assert.equal(h.verified.length, 1);
  assert.equal(h.errors.length, 1);
  assert.equal(h.timers.size, 0);
});

test('stop clears a pending timer before it can request another refresh', async () => {
  const h = harness();
  await h.begin();
  const requests = h.refreshes.length;
  assert.equal(h.timers.size, 1);
  h.sync.stop();
  assert.equal(h.timers.size, 0);
  await h.sync.check(); await settle();
  assert.equal(h.refreshes.length, requests);
});

test('raw Firebase verification does not update UI until forced token refresh succeeds', async () => {
  const h = harness(async (user, call) => {
    // Firebase reload succeeds, but getIdToken(true) fails on the first attempt.
    user.emailVerified = true;
    if (call === 1) throw new Error('Forced ID token refresh temporarily failed');
    return { emailVerified: true, email: user.email };
  });
  await h.begin();
  assert.equal(h.user.emailVerified, true);
  assert.equal(h.verified.length, 0);
  assert.equal(h.errors.length, 1);
  assert.equal(h.timers.size, 1);
  h.fire(); await settle();
  assert.equal(h.refreshes.length, 2);
  assert.equal(h.verified.length, 1);
  assert.equal(h.timers.size, 0);
});

test('page restore rechecks a raw-verified user after the previous token refresh failed', async () => {
  const h = harness(async (user, call) => {
    user.emailVerified = true;
    if (call === 1) throw new Error('Token refresh failed before page was suspended');
    return { emailVerified: true, email: user.email };
  });
  await h.begin();
  assert.equal(h.user.emailVerified, true);
  assert.equal(h.verified.length, 0);
  assert.equal(h.errors.length, 1);
  h.sync.stop();
  assert.equal(h.timers.size, 0);
  await h.sync.start(h.user); await settle();
  assert.equal(h.refreshes.length, 2);
  assert.equal(h.verified.length, 1);
  assert.equal(h.timers.size, 0);
});
