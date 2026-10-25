import { getCurrentUser } from "./auth.js";
import { validateFile, assertOwnedPath } from "./file-policy.js";

function failure(message, code = "") {
  return Object.assign(new Error(message), { code });
}

function currentUser() {
  const user = getCurrentUser();
  if (!user) throw failure("Hãy đăng nhập trước.", "storage/unauthenticated");
  return user;
}

function checkSession(user) {
  if (getCurrentUser() !== user) throw failure("Phiên đăng nhập đã thay đổi.", "storage/session-changed");
}

function responseError(status, body) {
  const detail = typeof body?.detail === "string" ? body.detail : "Thao tác chưa hoàn tất. Hãy thử lại.";
  const message = detail.length < 220 && !/bearer|eyJ|private_key/i.test(detail) ? detail : "Thao tác chưa hoàn tất. Hãy thử lại.";
  const code = { 401: "storage/unauthenticated", 403: "storage/unauthorized" }[status] || "";
  return failure(message, code);
}

async function request(path, options = {}) {
  const user = currentUser();
  const token = await user.getIdToken();
  checkSession(user);
  const response = await fetch(path, {
    ...options, cache: "no-store", redirect: "error",
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  checkSession(user);
  if (!response.ok) {
    let body;
    try { body = await response.json(); } catch { /* Generic public error below. */ }
    throw responseError(response.status, body);
  }
  return { response, user };
}

function fileEndpoint(fullPath) {
  const user = currentUser();
  assertOwnedPath(user.uid, fullPath);
  return `/api/files/${encodeURIComponent(fullPath.slice(`users/${user.uid}/`.length))}`;
}

// XHR reports browser-to-server progress; at 100% the server may still be saving.
// Cancellation is available immediately, including during ID-token refresh.
export function uploadFile(file, onProgress = () => {}, folderId = null) {
  const user = currentUser();
  validateFile(file);
  let xhr;
  let cancelled = false;
  let settled = false;
  let rejectUpload;
  const completed = new Promise((resolve, reject) => {
    rejectUpload = reject;
    void (async () => {
      try {
        const token = await user.getIdToken();
        checkSession(user);
        if (cancelled) return;
        xhr = new XMLHttpRequest();
        const uploadQuery = new URLSearchParams({ name: file.name });
        if (folderId) uploadQuery.set("folderId", folderId);
        xhr.open("PUT", "/api/files?" + uploadQuery);
        xhr.timeout = 120000;
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && !cancelled && getCurrentUser() === user) {
            onProgress(Math.round(event.loaded / event.total * 100));
          }
        };
        xhr.onload = () => {
          if (settled) return;
          settled = true;
          try {
            checkSession(user);
            let body;
            try { body = JSON.parse(xhr.responseText); } catch { /* Invalid response below. */ }
            if (xhr.status < 200 || xhr.status >= 300) throw responseError(xhr.status, body);
            if (!body?.fullPath) throw failure("Máy chủ trả về kết quả tải lên không hợp lệ.");
            resolve(body);
          } catch (error) { reject(error); }
        };
        xhr.onerror = () => {
          if (settled) return;
          settled = true;
          reject(failure("Mất kết nối khi tải lên. Làm mới danh sách trước khi thử lại.", "storage/network-error"));
        };
        xhr.ontimeout = () => {
          if (settled) return;
          settled = true;
          reject(failure("Yêu cầu đã hết thời gian. Làm mới danh sách trước khi thử lại.", "storage/request-timeout"));
        };
        xhr.onabort = () => {
          if (settled) return;
          settled = true;
          reject(failure("Đã dừng yêu cầu tải lên. Kiểm tra danh sách vì máy chủ có thể đã lưu tệp.", "storage/canceled"));
        };
        xhr.send(file);
      } catch (error) {
        if (!settled) { settled = true; reject(error); }
      }
    })();
  });
  return {
    task: {
      cancel() {
        if (settled) return false;
        cancelled = true;
        if (xhr) xhr.abort();
        else {
          settled = true;
          rejectUpload(failure("Đã hủy tải tệp lên.", "storage/canceled"));
        }
        return true;
      },
    },
    completed,
  };
}

export async function listFiles(pageToken, view = "own", filters = {}) {
  const params = new URLSearchParams();
  if (pageToken) params.set("pageToken", pageToken);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  params.set("type", filters.type || "all");
  params.set("sort", filters.sort || "newest");
  if (view === "own") {
    params.set("scope", filters.q?.trim() ? "all" : "folder");
    if (filters.folderId) params.set("folderId", filters.folderId);
  }
  const query = "?" + params;
  const endpoint = { own: "/api/files", shared: "/api/files/shared-with-me", trash: "/api/files/trash" }[view];
  if (!endpoint) throw failure("Danh sách tài liệu không hợp lệ.");
  const { response, user } = await request(endpoint + query);
  const body = await response.json();
  checkSession(user);
  return body;
}

async function fetchFileBlob(fullPath, ownerUid = null, action = 'content') {
  let endpoint;
  if (ownerUid) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) throw failure("Chủ sở hữu tài liệu không hợp lệ.");
    assertOwnedPath(ownerUid, fullPath);
    const name = fullPath.slice(("users/" + ownerUid + "/").length);
    endpoint = "/api/files/shared/" + encodeURIComponent(ownerUid) + "/" + encodeURIComponent(name) + "/" + action;
  } else {
    endpoint = fileEndpoint(fullPath) + "/" + action;
  }
  const { response, user } = await request(endpoint);
  const blob = await response.blob();
  checkSession(user);
  return blob;
}


export async function downloadFile(fullPath, ownerUid = null) {
  return fetchFileBlob(fullPath, ownerUid, "content");
}

export async function previewFile(fullPath, ownerUid = null) {
  return fetchFileBlob(fullPath, ownerUid, "preview");
}

async function jsonRequest(path, options) {
  const { response, user } = await request(path, options);
  const body = await response.json();
  checkSession(user);
  return body;
}

function folderEndpoint(id) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw failure("Thư mục không hợp lệ.");
  return "/api/folders/" + encodeURIComponent(id);
}

function jsonOptions(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function listFolders(parentId = null, all = false) {
  const query = new URLSearchParams();
  if (all) query.set("all", "true");
  else if (parentId) query.set("parentId", parentId);
  return jsonRequest("/api/folders" + (query.size ? "?" + query : ""));
}

export async function createFolder(name, parentId = null) {
  return jsonRequest("/api/folders", jsonOptions("POST", { name, parentId }));
}

export async function updateFolder(id, changes) {
  return jsonRequest(folderEndpoint(id), jsonOptions("PATCH", changes));
}

export async function deleteFolder(id) {
  await request(folderEndpoint(id), { method: "DELETE" });
}

export async function updateFile(fullPath, changes) {
  return jsonRequest(fileEndpoint(fullPath), jsonOptions("PATCH", changes));
}

export async function removeFile(fullPath) {
  const { user } = await request(fileEndpoint(fullPath), { method: "DELETE" });
  checkSession(user);
}

export async function trashFile(fullPath) {
  await request(fileEndpoint(fullPath) + "/trash", { method: "POST" });
}

export async function restoreFile(fullPath) {
  await request(fileEndpoint(fullPath) + "/restore", { method: "POST" });
}

export async function getShares(fullPath) {
  const { response, user } = await request(fileEndpoint(fullPath) + "/shares");
  const body = await response.json();
  checkSession(user);
  return body.shares || [];
}

export async function grantShare(fullPath, email) {
  await request(fileEndpoint(fullPath) + "/shares", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function revokeShare(fullPath, recipientUid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(recipientUid)) throw failure("Người nhận không hợp lệ.");
  await request(fileEndpoint(fullPath) + "/shares/" + encodeURIComponent(recipientUid), { method: "DELETE" });
}


// ──────────────────────────────────────────────────────────────────────────────
// Giai đoạn 1: Multi-file Upload Queue
// ──────────────────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 2; // số file tải lên cùng lúc tối đa

/**
 * Tạo một upload queue cho nhiều file.
 * @param {File[]} files - danh sách file cần tải
 * @param {function} onUpdate - callback nhận ({ jobs, activeCount, doneCount, total, paused, totalProgress })
 * @param {string|null} folderId - thư mục đích
 * @returns queue object với các phương thức điều khiển
 */
export function createUploadQueue(files, onUpdate = () => {}, folderId = null) {
  const jobs = files.map((file, index) => ({
    id: index,
    file,
    status: "pending", // pending | uploading | done | error | cancelled
    progress: 0,
    error: null,
    _task: null,
  }));

  let paused = false;
  let destroyed = false;

  function notify() {
    const activeCount = jobs.filter(j => j.status === "uploading").length;
    const doneCount = jobs.filter(j => j.status === "done").length;
    const cancelledCount = jobs.filter(j => j.status === "cancelled").length;
    const errorCount = jobs.filter(j => j.status === "error").length;
    const totalProgress = jobs.length > 0
      ? Math.round(jobs.reduce((sum, j) => sum + j.progress, 0) / jobs.length)
      : 0;
    onUpdate({ jobs: [...jobs], activeCount, doneCount, total: jobs.length, paused, totalProgress, cancelledCount, errorCount });
  }

  async function startNext() {
    if (destroyed || paused) return;
    const active = jobs.filter(j => j.status === "uploading").length;
    if (active >= MAX_CONCURRENT) return;
    const next = jobs.find(j => j.status === "pending");
    if (!next) return;

    next.status = "uploading";
    next.progress = 0;
    next.error = null;
    notify();

    try {
      const { task, completed } = uploadFile(
        next.file,
        (pct) => {
          if (next.status === "uploading") {
            next.progress = typeof pct === "number" ? pct : 0;
            notify();
          }
        },
        folderId
      );
      next._task = task;
      await completed;
      if (next.status === "uploading") {
        next.status = "done";
        next.progress = 100;
      }
    } catch (err) {
      if (next.status === "uploading") {
        next.status = "error";
        next.error = err;
      }
    }
    notify();
    if (!destroyed) void startNext(); // bắt đầu file tiếp theo
  }

  // Khởi động: fill MAX_CONCURRENT slots
  for (let i = 0; i < MAX_CONCURRENT; i++) void startNext();

  return {
    get jobs() { return jobs; },
    get paused() { return paused; },

    /** Tạm dừng: không bắt đầu file mới; file đang tải tiếp tục đến khi xong. */
    pause() {
      paused = true;
      notify();
    },

    /** Tiếp tục queue sau khi tạm dừng. */
    resume() {
      if (!paused) return;
      paused = false;
      notify();
      for (let i = 0; i < MAX_CONCURRENT; i++) void startNext();
    },

    /** Thử lại một job đang ở trạng thái lỗi. */
    retryJob(id) {
      const job = jobs.find(j => j.id === id && j.status === "error");
      if (!job) return;
      job.status = "pending";
      job.progress = 0;
      job.error = null;
      job._task = null;
      notify();
      if (!paused && !destroyed) void startNext();
    },

    /** Hủy một job cụ thể. */
    cancelJob(id) {
      const job = jobs.find(j => j.id === id);
      if (!job || job.status === "done" || job.status === "cancelled") return;
      if (job._task) job._task.cancel();
      job.status = "cancelled";
      job.progress = 0;
      job._task = null;
      notify();
    },

    /** Hủy toàn bộ queue. */
    cancelAll() {
      destroyed = true;
      for (const job of jobs) {
        if (job.status === "pending" || job.status === "uploading") {
          if (job._task) job._task.cancel();
          job.status = "cancelled";
          job._task = null;
        }
      }
      notify();
    },

    /** Trả về true nếu mọi job đã xử lý xong (done/error/cancelled). */
    isDone() {
      return jobs.every(j => j.status === "done" || j.status === "error" || j.status === "cancelled");
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Giai đoạn 3: Tải xuống file lớn với Streaming + progress
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Tải xuống file với Streaming Response và báo cáo tiến độ theo byte.
 * Nếu server không cung cấp Content-Length, onProgress sẽ không được gọi.
 * @param {string} fullPath - đường dẫn đầy đủ trong Storage
 * @param {string|null} ownerUid - UID chủ sở hữu (nếu file được chia sẻ)
 * @param {function} onProgress - callback(percent: number 0–100)
 */
export async function downloadFileWithProgress(fullPath, ownerUid = null, onProgress = () => {}) {
  const user = currentUser();
  let endpoint;
  if (ownerUid) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) throw failure("Chủ sở hữu tài liệu không hợp lệ.");
    const name = fullPath.slice(("users/" + ownerUid + "/").length);
    endpoint = "/api/files/shared/" + encodeURIComponent(ownerUid) + "/" + encodeURIComponent(name) + "/content";
  } else {
    endpoint = fileEndpoint(fullPath) + "/content";
  }

  const token = await user.getIdToken();
  checkSession(user);

  const res = await fetch(endpoint, {
    cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${token}` },
  });
  checkSession(user);

  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { /* ignore */ }
    throw responseError(res.status, body);
  }

  // Nếu browser không hỗ trợ streaming, fallback về blob()
  if (!res.body) return res.blob();

  const contentLength = res.headers.get("Content-Length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  const contentType = (res.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim();

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (totalBytes > 0) {
      onProgress(Math.min(100, Math.round(received / totalBytes * 100)));
    }
    checkSession(user);
  }

  return new Blob(chunks, { type: contentType });
}
