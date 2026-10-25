/** Static UI integration contract; no Firebase credentials or network required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/styles.css', import.meta.url), 'utf8');

function ids(text) { return [...text.matchAll(/\bid="([a-z][a-z0-9-]*)"/g)].map(x=>x[1]); }

test('HTML IDs are unique and all UI refs exist', () => {
  const all=ids(html);
  assert.equal(new Set(all).size,all.length);
  const refs=[...ui.matchAll(/'([a-z][a-z0-9-]*)'/g)].map(x=>x[1]);
  const elementBlock = ui.slice(ui.indexOf('const el ='), ui.indexOf('].map((id)'));
  for (const ref of elementBlock.matchAll(/'([a-z][a-z0-9-]*)'/g)) assert.ok(all.includes(ref[1]),`missing element ${ref[1]}`);
  for (const id of ['file-search','file-filter','file-sort','file-results-label','stat-total','stat-size','stat-docs','stat-images','delete-dialog','delete-filename','toggle-password']) {
    assert.ok(all.includes(id),`missing ${id}`);
    assert.ok(refs.includes(id),`UI missing ${id}`);
  }
});

test('supports authenticated file operations and clear deletion decision',()=>{
  for (const token of ['chooseFile','uploadFile','loadFilePage','downloadFile','removeFile','confirmDeletion','applyFileFilters','onAuthChange']) assert.ok(ui.includes(token),token);
  assert.match(html,/method="dialog"/);
  assert.match(html,/value="cancel"/);
  assert.match(html,/value="confirm"/);
});

test('labels global search and exposes folder and preview controls',()=>{
  assert.match(html,/toàn bộ tài liệu/);
  for (const id of ['folder-panel','folder-breadcrumbs','new-folder','preview-dialog','reset-dialog']) assert.ok(ids(html).includes(id),id);
  assert.doesNotMatch(html,/Tìm kiếm &amp; lọc trong trang đang xem/);
});

test('responsive UX and no credentials in frontend markup',()=>{
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/\.confirm-dialog/);
  assert.doesNotMatch(html,/-----BEGIN PRIVATE KEY-----/);
  assert.match(html,/aria-live="polite"/);
});
