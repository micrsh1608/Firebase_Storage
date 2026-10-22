// UX validation only. Storage Rules are the enforcement layer.
export const MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function validateFile(file) {
  if (!file || !ALLOWED_TYPES.has(file.type)) throw new Error("Chỉ nhận JPEG, PNG, WebP hoặc PDF.");
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error("File phải lớn hơn 0 và không quá 5 MiB.");
}

export function safeFileName(name) {
  // No slash, backslash, double-dot, controls or HTML. Keep readable Vietnamese names.
  const safe = name.normalize("NFC").replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\.{2,}/g, "_").replace(/^[. ]+|[. ]+$/g, "").slice(0, 120);
  return safe || "file";
}

export function assertOwnedPath(uid, path) {
  const prefix = `users/${uid}/`;
  const name = typeof path === "string" && path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (!uid || !name || /[\\/]/.test(name) || name === "." || name === "..") {
    throw new Error("Đường dẫn file không thuộc tài khoản hiện tại.");
  }
}
