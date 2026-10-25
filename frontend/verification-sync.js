// Dependency-injected session synchronizer; never verifies an email itself.
export function createVerificationSync({ getUser, refresh, onVerified, onError = () => {},
  isVisible = () => true, schedule = setTimeout, clear = clearTimeout,
  intervalMs = 5000, maxRetryMs = 30000 }) {
  let user = null, generation = 0, timer = null, pending = null, failures = 0;
  const cancelTimer = () => { if (timer !== null) clear(timer); timer = null; };
  const current = record => user === record.user && generation === record.generation && getUser() === record.user;
  function stop() { generation++; user = null; failures = 0; cancelTimer(); }
  function queue(record) {
    if (!current(record) || !isVisible()) return;
    cancelTimer();
    const delay = failures ? Math.min(maxRetryMs, intervalMs * 2 ** Math.min(failures, 4)) : intervalMs;
    timer = schedule(() => { timer = null; void check(); }, delay);
  }
  function check() {
    cancelTimer();
    if (!user || getUser() !== user) { stop(); return Promise.resolve(); }
    if (pending?.generation === generation) return pending.promise;
    if (!isVisible()) return Promise.resolve();
    const record = { user, generation, promise: null };
    pending = record;
    record.promise = Promise.resolve().then(() => refresh(record.user)).then(result => {
      if (!current(record)) return;
      failures = 0;
      if (result.emailVerified === true) {
        stop();
        onVerified(result, record.user);
      }
    }).catch(error => {
      if (current(record)) { failures++; onError(error, record.user); }
    }).finally(() => {
      if (pending === record) pending = null;
      queue(record);
    });
    return record.promise;
  }
  function start(nextUser) {
    stop();
    // A raw true flag can precede a failed token refresh; callers decide when
    // verification is fully confirmed. A resumed session must retry that work.
    if (!nextUser) return Promise.resolve();
    user = nextUser;
    return check();
  }
  return { start, check, stop };
}
