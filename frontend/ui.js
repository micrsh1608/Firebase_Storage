// Dynamic imports keep SDK/CDN startup failures inside the visible boot error.
let watchAuth, register, login, logout, getCurrentUser, verifyWithBackend;
let uploadFile, listFiles, getFileURL, removeFile;

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries([
  'environment-dot', 'environment-label', 'boot-error', 'project-id', 'bucket-name',
  'login-tab', 'register-tab', 'auth-form', 'email', 'password', 'auth-submit', 'auth-feedback',
  'auth-description', 'signed-out-view', 'signed-in-view', 'account-email', 'account-uid',
  'signout-button', 'user-prefix', 'verify-button', 'verify-feedback', 'file-input', 'drop-zone',
  'drop-title', 'drop-description', 'selected-file', 'selected-name', 'selected-meta', 'clear-file',
  'upload-button', 'upload-progress', 'progress-label', 'progress-bar', 'cancel-upload', 'upload-feedback',
  'refresh-button', 'files-empty', 'empty-title', 'empty-description', 'files-table-wrap', 'files-body',
  'file-count', 'files-feedback', 'pagination', 'page-label', 'previous-page', 'next-page',
  'url-result', 'url-filename', 'download-url', 'copy-url', 'open-url', 'clear-url', 'url-feedback',
].map((id) => [id, $(id)]));

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE = 5 * 1024 * 1024;
let initialized = false;
let currentUser = null;
let authMode = 'login';
let authBusy = false;
let generation = 0;
let selectedFile = null;
let uploadSession = null;
let listBusy = false;
let listRequest = 0;
let pageTokens = [undefined];
let currentPage = 0;
let nextPageToken;
let activeURLPath = null;
let urlRequest = 0;

function feedback(target, message = '', type = 'success') {
  target.textContent = message;
  target.classList.toggle('error', type === 'error');
  target.classList.toggle('neutral', type === 'neutral');
}

function friendlyError(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-email': 'Email chưa đúng định dạng.',
    'auth/missing-password': 'Vui lòng nhập mật khẩu.',
    'auth/weak-password': 'Mật khẩu cần có ít nhất 6 ký tự.',
    'auth/email-already-in-use': 'Email này đã được đăng ký. Hãy chuyển sang Đăng nhập.',
    'auth/invalid-credential': 'Email hoặc mật khẩu chưa đúng.',
    'auth/user-not-found': 'Email hoặc mật khẩu chưa đúng.',
    'auth/wrong-password': 'Email hoặc mật khẩu chưa đúng.',
    'auth/too-many-requests': 'Quá nhiều yêu cầu. Vui lòng đợi một lát rồi thử lại.',
    'auth/network-request-failed': 'Không kết nối được dịch vụ xác thực. Kiểm tra mạng hoặc Auth Emulator.',
    'auth/operation-not-allowed': 'Email/Password chưa được bật trong Firebase Authentication.',
    'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa.',
    'storage/unauthenticated': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    'storage/unauthorized': 'Không có quyền thực hiện. Kiểm tra UID, đường dẫn và Storage Rules.',
    'storage/object-not-found': 'Tệp không còn tồn tại. Hãy làm mới danh sách.',
    'storage/canceled': 'Đã hủy tải tệp lên.',
    'storage/retry-limit-exceeded': 'Kết nối tải tệp đã hết thời gian. Kiểm tra mạng rồi thử lại.',
    'storage/quota-exceeded': 'Bucket đã vượt hạn mức. Kiểm tra cấu hình và hạn mức Firebase.',
    'storage/unknown': 'Storage chưa xử lý được yêu cầu. Kiểm tra mạng, bucket và cấu hình emulator.',
  };
  if (messages[code]) return messages[code];
  // The demo's own validation messages do not contain credentials or ID tokens.
  if (error instanceof Error && !code && error.message && error.message.length < 220 && !/token|bearer|eyJ/i.test(error.message)) return error.message;
  return 'Thao tác chưa hoàn tất. Kiểm tra cấu hình, kết nối và thử lại.';
}

function sameUser(capturedGeneration, uid) {
  return generation === capturedGeneration && currentUser?.uid === uid;
}

function formatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatDate(value) {
  if (!value) return 'Chưa có thời gian cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có thời gian cập nhật';
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function updateControls() {
  const authenticated = initialized && Boolean(currentUser);
  const uploading = Boolean(uploadSession);
  el['login-tab'].disabled = !initialized || authBusy;
  el['register-tab'].disabled = !initialized || authBusy;
  el.email.disabled = !initialized || authBusy;
  el.password.disabled = !initialized || authBusy;
  el['auth-submit'].disabled = !initialized || authBusy;
  el['signout-button'].disabled = !authenticated || authBusy;
  el['file-input'].disabled = !authenticated || uploading;
  el['drop-zone'].setAttribute('aria-disabled', String(!authenticated || uploading));
  el['upload-button'].disabled = !authenticated || !selectedFile || uploading;
  el['clear-file'].disabled = uploading;
  el['refresh-button'].disabled = !authenticated || listBusy;
  el['previous-page'].disabled = !authenticated || listBusy || currentPage === 0;
  el['next-page'].disabled = !authenticated || listBusy || !nextPageToken;
  if (!authenticated) el['verify-button'].disabled = true;
}

function switchAuthMode(mode) {
  authMode = mode;
  const loggingIn = mode === 'login';
  for (const [id, active] of [['login-tab', loggingIn], ['register-tab', !loggingIn]]) {
    el[id].classList.toggle('active', active);
    el[id].setAttribute('aria-selected', String(active));
    el[id].tabIndex = active ? 0 : -1;
  }
  el['auth-form'].setAttribute('aria-labelledby', loggingIn ? 'login-tab' : 'register-tab');
  el.password.autocomplete = loggingIn ? 'current-password' : 'new-password';
  el['auth-submit'].replaceChildren(document.createTextNode(loggingIn ? 'Đăng nhập ' : 'Tạo tài khoản '));
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';
  el['auth-submit'].append(arrow);
  feedback(el['auth-feedback']);
}

function clearURL() {
  urlRequest += 1;
  activeURLPath = null;
  el['download-url'].value = '';
  el['open-url'].removeAttribute('href');
  el['url-result'].hidden = true;
  feedback(el['url-feedback']);
}

function clearSelectedFile() {
  selectedFile = null;
  el['file-input'].value = '';
  el['selected-file'].hidden = true;
  el['selected-name'].textContent = '';
  el['selected-meta'].textContent = '';
  updateControls();
}

function resetPagination() {
  pageTokens = [undefined];
  currentPage = 0;
  nextPageToken = undefined;
}

function showEmpty(title, description) {
  el['files-table-wrap'].hidden = true;
  el['files-empty'].hidden = false;
  el['empty-title'].textContent = title;
  el['empty-description'].textContent = description;
}

function onAuthChange(user) {
  generation += 1;
  listRequest += 1;
  listBusy = false;
  if (uploadSession) {
    uploadSession.cancelRequested = true;
    uploadSession.task?.cancel();
    uploadSession = null;
  }
  currentUser = user;
  resetPagination();
  clearSelectedFile();
  clearURL();
  el['upload-progress'].hidden = true;
  el['progress-bar'].value = 0;
  el['files-body'].replaceChildren();
  el['file-count'].textContent = '0';
  el.pagination.hidden = true;
  feedback(el['upload-feedback']);
  feedback(el['files-feedback']);
  feedback(el['verify-feedback']);
  el['signed-out-view'].hidden = Boolean(user);
  el['signed-in-view'].hidden = !user;
  el['account-email'].textContent = user?.email || 'Tài khoản Firebase';
  el['account-uid'].textContent = user?.uid || '';
  el['user-prefix'].textContent = user ? `users/${user.uid}/` : 'Đăng nhập để xem đường dẫn';
  el['drop-title'].textContent = user ? 'Thả tệp vào đây' : 'Đăng nhập để tải tệp lên';
  el['auth-description'].textContent = user ? 'Mỗi tài khoản quản lý tệp trong đường dẫn theo UID.' : 'Dùng email và mật khẩu để mở kho tệp theo UID.';
  el['verify-button'].disabled = !user;
  updateControls();
  if (user) void loadFilePage();
  else showEmpty('Kho tệp đang chờ bạn', 'Đăng nhập để xem và quản lý tệp của tài khoản.');
}

function chooseFile(file) {
  if (!currentUser || uploadSession) return;
  feedback(el['upload-feedback']);
  if (!file) return;
  if (!ALLOWED_TYPES.has(file.type)) {
    clearSelectedFile();
    feedback(el['upload-feedback'], 'Chỉ nhận JPEG, PNG, WEBP hoặc PDF có MIME type hợp lệ.', 'error');
    return;
  }
  if (file.size === 0 || file.size > MAX_SIZE) {
    clearSelectedFile();
    feedback(el['upload-feedback'], file.size === 0 ? 'Tệp rỗng chưa thể tải lên. Hãy chọn tệp có nội dung.' : 'Tệp vượt quá 5 MiB. Hãy chọn tệp nhỏ hơn.', 'error');
    return;
  }
  selectedFile = file;
  el['selected-name'].textContent = file.name;
  el['selected-meta'].textContent = `${file.type} · ${formatSize(file.size)}`;
  el['selected-file'].hidden = false;
  updateControls();
}

function fileAction(label, handler, { danger = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `file-action${danger ? ' danger' : ''}`;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderFiles(files, capturedGeneration, uid) {
  const fragment = document.createDocumentFragment();
  for (const file of files) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const title = document.createElement('span');
    title.className = 'file-title';
    title.textContent = file.name;
    const path = document.createElement('span');
    path.className = 'file-path mono';
    path.textContent = file.fullPath;
    nameCell.append(title, path);

    const metaCell = document.createElement('td');
    const type = document.createElement('span');
    type.className = 'file-type';
    type.textContent = file.contentType === 'application/pdf' ? 'PDF' : (file.contentType?.replace('image/', '').toUpperCase() || 'FILE');
    const size = document.createElement('span');
    size.className = 'file-info';
    size.textContent = formatSize(file.size);
    const updated = document.createElement('span');
    updated.className = 'file-date';
    updated.textContent = formatDate(file.updated);
    metaCell.append(type, size, updated);

    const actionCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'file-actions';
    actions.append(
      fileAction('Sao chép path', () => void copyText(file.fullPath, el['files-feedback'], 'Đã sao chép đường dẫn tệp.', capturedGeneration, uid)),
      fileAction('Lấy URL ↗', (event) => void showDownloadURL(file, event.currentTarget, capturedGeneration, uid)),
      fileAction('Xóa tệp', (event) => void deleteFile(file, event.currentTarget, capturedGeneration, uid), { danger: true }),
    );
    for (const button of actions.children) button.setAttribute('aria-label', `${button.textContent}: ${file.name}`);
    actionCell.append(actions);
    row.append(nameCell, metaCell, actionCell);
    fragment.append(row);
  }
  el['files-body'].replaceChildren(fragment);
}

async function loadFilePage() {
  if (!currentUser) return false;
  const capturedGeneration = generation;
  const uid = currentUser.uid;
  const request = ++listRequest;
  listBusy = true;
  feedback(el['files-feedback'], 'Đang lấy danh sách tệp…', 'neutral');
  updateControls();
  try {
    const result = await listFiles(pageTokens[currentPage]);
    if (!sameUser(capturedGeneration, uid) || request !== listRequest) return false;
    const files = result.files || [];
    nextPageToken = result.nextPageToken;
    renderFiles(files, capturedGeneration, uid);
    el['file-count'].textContent = String(files.length);
    el['page-label'].textContent = `Trang ${currentPage + 1} · ${files.length} tệp`;
    el.pagination.hidden = files.length === 0 && currentPage === 0 && !nextPageToken;
    if (files.length) {
      el['files-empty'].hidden = true;
      el['files-table-wrap'].hidden = false;
    } else {
      showEmpty('Chưa có tệp trong trang này', currentPage ? 'Quay về trang trước hoặc làm mới danh sách.' : 'Chọn một ảnh hoặc PDF ở phía trên để bắt đầu.');
    }
    feedback(el['files-feedback']);
    return true;
  } catch (error) {
    if (!sameUser(capturedGeneration, uid) || request !== listRequest) return false;
    nextPageToken = undefined;
    el['files-body'].replaceChildren();
    el['file-count'].textContent = '0';
    showEmpty('Chưa tải được danh sách', 'Kiểm tra kết nối và Storage Rules, sau đó chọn Làm mới.');
    feedback(el['files-feedback'], friendlyError(error), 'error');
    return false;
  } finally {
    if (sameUser(capturedGeneration, uid) && request === listRequest) {
      listBusy = false;
      updateControls();
    }
  }
}

async function copyText(text, target, successMessage, capturedGeneration = generation, uid = currentUser?.uid) {
  if (!sameUser(capturedGeneration, uid)) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    if (sameUser(capturedGeneration, uid)) feedback(target, successMessage);
  } catch {
    if (sameUser(capturedGeneration, uid)) feedback(target, 'Trình duyệt chưa cho phép sao chép. Hãy chọn và sao chép nội dung thủ công.', 'error');
  }
}

async function showDownloadURL(file, button, capturedGeneration, uid) {
  if (!sameUser(capturedGeneration, uid)) return;
  const request = ++urlRequest;
  button.disabled = true;
  feedback(el['url-feedback'], 'Đang lấy URL tải xuống…', 'neutral');
  try {
    const url = await getFileURL(file.fullPath);
    if (!sameUser(capturedGeneration, uid) || request !== urlRequest) return;
    const parsedURL = new URL(url);
    if (!['http:', 'https:'].includes(parsedURL.protocol)) throw new Error('Liên kết tải xuống không hợp lệ.');
    activeURLPath = file.fullPath;
    el['download-url'].value = url;
    el['open-url'].href = url;
    el['url-filename'].textContent = file.name;
    el['url-result'].hidden = false;
    feedback(el['url-feedback'], 'Đã lấy URL. Hãy chia sẻ liên kết này có chủ đích.');
  } catch (error) {
    if (sameUser(capturedGeneration, uid) && request === urlRequest) feedback(el['url-feedback'], friendlyError(error), 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteFile(file, button, capturedGeneration, uid) {
  if (!sameUser(capturedGeneration, uid)) return;
  if (!window.confirm(`Xóa tệp “${file.name}”?\nTệp sẽ bị gỡ khỏi danh sách; demo không có chức năng khôi phục.`)) return;
  if (!sameUser(capturedGeneration, uid)) return;
  button.disabled = true;
  try {
    await removeFile(file.fullPath);
    if (!sameUser(capturedGeneration, uid)) return;
    if (activeURLPath === file.fullPath) clearURL();
    resetPagination();
    const reloaded = await loadFilePage();
    if (sameUser(capturedGeneration, uid) && reloaded) feedback(el['files-feedback'], `Đã xóa ${file.name}.`);
  } catch (error) {
    if (sameUser(capturedGeneration, uid)) feedback(el['files-feedback'], friendlyError(error), 'error');
  } finally {
    if (sameUser(capturedGeneration, uid)) button.disabled = false;
  }
}

el['login-tab'].addEventListener('click', () => switchAuthMode('login'));
el['register-tab'].addEventListener('click', () => switchAuthMode('register'));
for (const tab of [el['login-tab'], el['register-tab']]) {
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const registerMode = event.key === 'End' || (event.key !== 'Home' && authMode === 'login');
    switchAuthMode(registerMode ? 'register' : 'login');
    el[registerMode ? 'register-tab' : 'login-tab'].focus();
  });
}

el['auth-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!initialized || authBusy || !el['auth-form'].reportValidity()) return;
  authBusy = true;
  const action = authMode;
  feedback(el['auth-feedback'], action === 'login' ? 'Đang đăng nhập…' : 'Đang tạo tài khoản…', 'neutral');
  updateControls();
  try {
    await (action === 'login' ? login : register)(el.email.value.trim(), el.password.value);
    el.password.value = '';
    feedback(el['auth-feedback'], action === 'login' ? 'Đăng nhập thành công.' : 'Đã tạo tài khoản và đăng nhập.');
  } catch (error) {
    feedback(el['auth-feedback'], friendlyError(error), 'error');
  } finally {
    authBusy = false;
    updateControls();
  }
});

el['signout-button'].addEventListener('click', async () => {
  if (authBusy) return;
  authBusy = true;
  feedback(el['auth-feedback']);
  updateControls();
  try {
    await logout();
    el.password.value = '';
    feedback(el['auth-feedback'], 'Đã đăng xuất.');
  } catch (error) {
    feedback(el['auth-feedback'], friendlyError(error), 'error');
  } finally {
    authBusy = false;
    updateControls();
  }
});

el['verify-button'].addEventListener('click', async () => {
  const user = getCurrentUser();
  if (!user || !currentUser) return;
  const capturedGeneration = generation;
  const uid = currentUser.uid;
  el['verify-button'].disabled = true;
  feedback(el['verify-feedback'], 'Đang xác thực với API…', 'neutral');
  try {
    const result = await verifyWithBackend();
    if (!sameUser(capturedGeneration, uid)) return;
    const returnedUID = result?.uid || result?.user?.uid;
    feedback(el['verify-feedback'], returnedUID ? `API đã xác thực UID: ${returnedUID}` : 'API đã xác thực ID token thành công.');
  } catch (error) {
    if (sameUser(capturedGeneration, uid)) feedback(el['verify-feedback'], friendlyError(error), 'error');
  } finally {
    if (sameUser(capturedGeneration, uid)) el['verify-button'].disabled = false;
  }
});

el['file-input'].addEventListener('change', () => chooseFile(el['file-input'].files?.[0]));
el['clear-file'].addEventListener('click', clearSelectedFile);
for (const eventName of ['dragenter', 'dragover']) {
  el['drop-zone'].addEventListener(eventName, (event) => {
    event.preventDefault();
    if (currentUser && !uploadSession) el['drop-zone'].classList.add('drag-over');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  el['drop-zone'].addEventListener(eventName, (event) => {
    event.preventDefault();
    el['drop-zone'].classList.remove('drag-over');
  });
}
el['drop-zone'].addEventListener('drop', (event) => {
  if (!currentUser || uploadSession) return;
  const files = event.dataTransfer?.files;
  if (files?.length !== 1) {
    feedback(el['upload-feedback'], 'Vui lòng chọn một tệp cho mỗi lượt tải.', 'error');
    return;
  }
  chooseFile(files[0]);
});
// Keep accidental drops outside the target from navigating away from the demo.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

el['upload-button'].addEventListener('click', async () => {
  if (!currentUser || !selectedFile || uploadSession) return;
  const capturedGeneration = generation;
  const uid = currentUser.uid;
  const file = selectedFile;
  const session = { task: null, cancelRequested: false };
  uploadSession = session;
  feedback(el['upload-feedback']);
  el['upload-progress'].hidden = false;
  el['progress-bar'].value = 0;
  el['progress-label'].textContent = 'Đang tải lên… 0%';
  el['cancel-upload'].disabled = false;
  updateControls();
  try {
    const job = await uploadFile(file, (progress) => {
      if (!sameUser(capturedGeneration, uid) || uploadSession !== session) return;
      const percent = typeof progress === 'number' ? progress : ((progress?.bytesTransferred || 0) / (progress?.totalBytes || file.size)) * 100;
      const bounded = Math.max(0, Math.min(100, Math.round(percent)));
      el['progress-bar'].value = bounded;
      el['progress-label'].textContent = `Đang tải lên… ${bounded}%`;
    });
    session.task = job.task;
    if (session.cancelRequested || !sameUser(capturedGeneration, uid)) session.task?.cancel();
    await job.completed;
    if (!sameUser(capturedGeneration, uid) || uploadSession !== session) return;
    clearSelectedFile();
    feedback(el['upload-feedback'], `Đã tải lên ${file.name}.`);
    resetPagination();
    await loadFilePage();
  } catch (error) {
    if (sameUser(capturedGeneration, uid) && uploadSession === session) feedback(el['upload-feedback'], friendlyError(error), error?.code === 'storage/canceled' ? 'neutral' : 'error');
  } finally {
    if (uploadSession === session) {
      uploadSession = null;
      el['upload-progress'].hidden = true;
      updateControls();
    }
  }
});

el['cancel-upload'].addEventListener('click', () => {
  if (!uploadSession) return;
  uploadSession.cancelRequested = true;
  uploadSession.task?.cancel();
  el['cancel-upload'].disabled = true;
  el['progress-label'].textContent = 'Đang hủy tải…';
});
el['refresh-button'].addEventListener('click', () => {
  resetPagination();
  void loadFilePage();
});
el['previous-page'].addEventListener('click', () => {
  if (currentPage <= 0 || listBusy) return;
  currentPage -= 1;
  void loadFilePage();
});
el['next-page'].addEventListener('click', () => {
  if (!nextPageToken || listBusy) return;
  pageTokens[currentPage + 1] = nextPageToken;
  currentPage += 1;
  void loadFilePage();
});
el['copy-url'].addEventListener('click', () => void copyText(el['download-url'].value, el['url-feedback'], 'Đã sao chép URL tải xuống.'));
el['clear-url'].addEventListener('click', clearURL);
el['download-url'].addEventListener('focus', () => el['download-url'].select());

try {
  const client = await import('./firebase-client.js');
  const config = await client.ready;
  const [authentication, files] = await Promise.all([import('./auth.js'), import('./storage.js')]);
  ({ watchAuth, register, login, logout, getCurrentUser, verifyWithBackend } = authentication);
  ({ uploadFile, listFiles, getFileURL, removeFile } = files);
  const mode = String(config.mode || 'firebase');
  el['environment-label'].textContent = /emulator/i.test(mode) ? 'Firebase Emulator · Cục bộ' : 'Firebase · Trực tiếp';
  el['environment-dot'].classList.add('ready');
  el['project-id'].textContent = config.projectId || '—';
  el['bucket-name'].textContent = config.bucket || '—';
  initialized = true;
  switchAuthMode('login');
  updateControls();
  await watchAuth(onAuthChange);
} catch {
  initialized = false;
  updateControls();
  el['environment-label'].textContent = 'Chưa kết nối';
  el['environment-dot'].classList.add('error');
  el['boot-error'].textContent = 'Chưa khởi tạo được Firebase. Kiểm tra kết nối internet để tải Web SDK, cấu hình frontend và dịch vụ emulator (nếu dùng). Sau khi sửa, tải lại trang. Xem README để chạy demo bằng HTTP; không mở trực tiếp bằng file://.';
  el['boot-error'].hidden = false;
}
