import assert from "node:assert/strict";
import test from "node:test";
import { validateFile, safeFileName, assertOwnedPath } from "../frontend/file-policy.js";

test("accepts supported file types at the documented size boundaries", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
    assert.doesNotThrow(() => validateFile({ type, size: 1 }));
    assert.doesNotThrow(() => validateFile({ type, size: 5 * 1024 * 1024 }));
  }
});

test("rejects empty, oversized and unsupported uploads before starting a task", () => {
  for (const file of [null, { type: "image/png", size: 0 },
    { type: "application/pdf", size: 5 * 1024 * 1024 + 1 },
    { type: "text/html", size: 100 }, { type: "", size: 100 }]) {
    assert.throws(() => validateFile(file));
  }
});

test("keeps readable Vietnamese names while removing path and markup hazards", () => {
  assert.equal(safeFileName("bài tập số 2.pdf"), "bài tập số 2.pdf");
  assert.equal(safeFileName("ba\u0300i.pdf"), "bài.pdf");
  for (const input of ["../../secret.png", "..\\secret.png", "<img onerror=alert(1)>.png", "\u0000\r\n.png"]) {
    const name = safeFileName(input);
    assert.ok(name.length > 0 && name.length <= 120);
    assert.doesNotMatch(name, /[\\/<>\u0000-\u001f]|\.{2}/);
  }
  assert.equal(safeFileName(" . "), "file");
  assert.equal(safeFileName("a".repeat(500)).length, 120);
});

test("only accepts an immediate file inside the current user's prefix", () => {
  assert.doesNotThrow(() => assertOwnedPath("alice", "users/alice/id-bài tập.pdf"));
  for (const [uid, path] of [["", "users//file.png"], ["alice", null],
    ["alice", "users/bob/file.png"], ["alice", "users/alice-other/file.png"],
    ["alice", "users/alice/"], ["alice", "users/alice/nested/file.png"],
    ["alice", "users/alice/.."], ["alice", "users/alice/\\file.png"]]) {
    assert.throws(() => assertOwnedPath(uid, path));
  }
});
