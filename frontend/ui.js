// Dynamic imports keep SDK/CDN startup failures inside the visible boot error.
let watchAuth, register, login, logout, getCurrentUser, verifyWithBackend, sendVerification, refreshVerification, resetPassword, getVerificationRetryAt;
let verificationSync = null;
let verificationConfirmed = false;
let verificationCooldownTimer = null;
let uploadFile, listFiles, downloadFile, previewFile, removeFile, trashFile, restoreFile, getShares, grantShare, revokeShare, listFolders, createFolder, updateFolder, deleteFolder, updateFile;
let createUploadQueue, downloadFileWithProgress;

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
  'download-feedback', 'quota-used', 'quota-limit', 'quota-progress', 'quota-message',
  'file-search', 'file-filter', 'file-sort', 'file-results-label',
  'stat-total', 'stat-size', 'stat-docs', 'stat-images', 'toggle-password', 'delete-dialog', 'delete-filename',
  'recents-heading', 'library-description', 'share-dialog', 'share-filename', 'share-form', 'share-email',
  'share-submit', 'share-recipients', 'share-feedback', 'share-refresh', 'share-close',
  'email-verification', 'verification-status', 'send-verification', 'verification-feedback',
  'folder-panel', 'folder-list', 'folder-breadcrumbs', 'folder-feedback', 'new-folder', 'search-scope',
  'manager-dialog', 'manager-heading', 'manager-description', 'manager-form', 'manager-name-field', 'manager-name',
  'manager-target-field', 'manager-target', 'manager-submit', 'manager-close', 'manager-feedback',
  'preview-dialog', 'preview-heading', 'preview-content', 'preview-close', 'preview-feedback', 'preview-download',
  'forgot-password', 'reset-dialog', 'reset-form', 'reset-email', 'reset-submit', 'reset-close', 'reset-feedback',
].map((id) => [id, $(id)]));

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE = 10 * 1024 * 1024;
let initialized = false;
let cloudMode = false;
let verificationBusy = false;
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
let downloadRequest = 0;
let accountUsage = null;
let libraryView = 'own';
let viewGeneration = 0;
let shareContext = null;
let shareBusy = false;
let shareRequest = 0;
let currentFolderId = null;
let folderItems = [];
let folderBreadcrumbs = [];
let folderRequest = 0;
let managerContext = null;
let managerBusy = false;
let previewContext = null;
let previewObjectURL = null;
let disposePdfPreview = null;
let searchTimer = null;
let serverTotal = 0;
let resetBusy = false;
let resetRequest = 0;
let currentFiles = []; // The server filters the complete authorized set, then paginates.
// Giai đoạn 1: Multi-file upload queue state
let uploadQueue = null;       // createUploadQueue() instance
let queuePaused = false;      // theo dõi trạng thái pause

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
    'storage/unauthorized': 'Bạn không có quyền truy cập tài liệu này.',
    'storage/object-not-found': 'Tệp không còn tồn tại. Hãy làm mới danh sách.',
    'storage/canceled': 'Đã dừng yêu cầu tải lên. Kiểm tra danh sách vì máy chủ có thể đã lưu tệp.',
    'storage/network-error': 'Mất kết nối khi tải lên. Kiểm tra danh sách trước khi thử lại.',
    'storage/request-timeout': 'Yêu cầu đã hết thời gian. Kiểm tra danh sách trước khi thử lại.',
    'storage/session-changed': 'Phiên đăng nhập đã thay đổi.',
    'storage/retry-limit-exceeded': 'Kết nối tải tệp đã hết thời gian. Kiểm tra mạng rồi thử lại.',
    'storage/quota-exceeded': 'Bucket đã vượt hạn mức. Kiểm tra cấu hình và hạn mức Firebase.',
    'storage/unknown': 'Kho tài liệu chưa xử lý được yêu cầu. Kiểm tra kết nối rồi thử lại.',
  };
  if (messages[code]) return messages[code];
  // The demo's own validation messages do not contain credentials or ID tokens.
  if (error instanceof Error && !code && error.message && error.message.length < 220 && !/token|bearer|eyJ/i.test(error.message)) return error.message;
  return 'Thao tác chưa hoàn tất. Kiểm tra cấu hình, kết nối và thử lại.';
}

function sameUser(capturedGeneration, uid) {
  return generation === capturedGeneration && currentUser?.uid === uid;
}

function sameLibrary(capturedGeneration, uid, capturedView) {
  return sameUser(capturedGeneration, uid) && viewGeneration === capturedView;
}

function applyLibraryView() {
  const titles = { own: 'Tài liệu của tôi', shared: 'Được chia sẻ với tôi', trash: 'Thùng rác' };
  const descriptions = {
    own: 'Sắp xếp tài liệu trong thư mục và chia sẻ theo tài khoản. Từ khóa tìm trong toàn bộ tài liệu của bạn.',
    shared: 'Bạn có thể xem trước và tải xuống. Quyền quản lý tài liệu thuộc chủ sở hữu.',
    trash: 'Tài liệu trong thùng rác vẫn chiếm dung lượng. Khôi phục sẽ giữ tài liệu riêng tư và không khôi phục quyền chia sẻ cũ.',
  };
  el['recents-heading'].textContent = titles[libraryView];
  document.getElementById('file-library').dataset.view = libraryView;
  document.getElementById('file-library').setAttribute('aria-labelledby', 'library-' + libraryView);
  el['library-description'].textContent = descriptions[libraryView];
  el['folder-panel'].hidden = libraryView !== 'own';
  document.getElementById('file-date-heading').textContent = { own: 'Cập nhật', shared: 'Được chia sẻ', trash: 'Đã xóa' }[libraryView];
  for (const control of document.querySelectorAll('[data-library-view]')) {
    const active = control.dataset.libraryView === libraryView;
    control.classList.toggle('active', active);
    if (control.getAttribute('role') === 'tab') {
      control.setAttribute('aria-selected', String(active));
      control.tabIndex = active ? 0 : -1;
    } else if (active) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  }
}

function closeShareDialog() {
  shareContext = null;
  shareRequest += 1;
  shareBusy = false;
  if (el['share-dialog'].open) el['share-dialog'].close();
  el['share-email'].value = '';
  el['share-recipients'].replaceChildren();
  feedback(el['share-feedback']);
}

function switchLibraryView(view) {
  if (!['own', 'shared', 'trash'].includes(view) || view === libraryView) return;
  libraryView = view;
  viewGeneration += 1;
  listRequest += 1;
  listBusy = false;
  closeShareDialog();
  closePreview();
  closeManager();
  clearTimeout(searchTimer);
  if (el['delete-dialog'].open) el['delete-dialog'].close('cancel');
  clearDownload();
  resetPagination();
  currentFiles = [];
  el['files-body'].replaceChildren();
  el.pagination.hidden = true;
  showEmpty('Đang tải danh sách…', 'Vui lòng đợi trong giây lát.');
  el['file-search'].value = '';
  document.getElementById('topbar-search-input').value = '';
  el['file-filter'].value = 'all';
  el['file-sort'].value = 'newest';
  applyLibraryView();
  updateMetrics();
  updateControls();
  if (currentUser) void loadFilePage();
  else showEmpty('Đăng nhập để xem tài liệu', 'Sử dụng tài khoản của bạn để mở thư viện.');
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

function updateVerification() {
  clearTimeout(verificationCooldownTimer);
  verificationCooldownTimer = null;
  const shown = Boolean(currentUser);
  const verified = verificationConfirmed;
  const remaining = Math.max(0, Math.ceil(((getVerificationRetryAt?.(currentUser?.uid) || 0) - Date.now()) / 1000));
  el['email-verification'].hidden = !shown;
  el['verification-status'].textContent = verified ? 'Email đã xác minh'
    : currentUser?.emailVerified ? 'Đang đồng bộ xác minh email' : 'Đang chờ xác minh email';
  el['verification-status'].classList.toggle('verified', verified);
  el['send-verification'].hidden = verified || Boolean(currentUser?.emailVerified);
  el['send-verification'].textContent = remaining ? `Gửi lại email (${remaining}s)` : 'Gửi lại email xác minh';
  el['send-verification'].disabled = !shown || verified || verificationBusy || authBusy || remaining > 0;
  if (shown && !verified && remaining > 0) verificationCooldownTimer = setTimeout(updateVerification, 1000);
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
  el['upload-button'].disabled = !authenticated || !selectedFile || uploading || Boolean(accountUsage && selectedFile && (selectedFile.size + accountUsage.usedBytes > accountUsage.maxBytes || accountUsage.fileCount >= (accountUsage.maxFiles ?? 200)));
  el['clear-file'].disabled = uploading;
  el['refresh-button'].disabled = !authenticated || listBusy;
  el['previous-page'].disabled = !authenticated || listBusy || currentPage === 0;
  el['next-page'].disabled = !authenticated || listBusy || !nextPageToken;
  for (const id of ['file-search','file-filter','file-sort']) el[id].disabled = !authenticated;
  el['new-folder'].disabled = !authenticated || libraryView !== 'own' || Boolean(el['file-search'].value.trim());
  el['forgot-password'].disabled = !initialized || authBusy;
  for (const control of document.querySelectorAll('button[data-library-view]')) control.disabled = !authenticated;
  if (!authenticated) el['verify-button'].disabled = true;
  updateVerification();
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
  const heading = document.getElementById('auth-heading');
  if (!currentUser) heading.textContent = loggingIn ? 'Đăng nhập an toàn' : 'Tạo tài khoản mới';
  feedback(el['auth-feedback']);
}

function clearDownload() {
  downloadRequest += 1;
  feedback(el['download-feedback']);
}

function updateQuota(usage = null) {
  accountUsage = usage;
  el['quota-used'].textContent = usage ? formatSize(usage.usedBytes) : '—';
  el['quota-limit'].textContent = usage ? formatSize(usage.maxBytes) : '50 MiB';
  el['quota-progress'].value = usage ? Math.min(100, usage.usedBytes / usage.maxBytes * 100) : 0;
  el['quota-message'].textContent = usage
    ? `Còn ${formatSize(Math.max(0, usage.maxBytes - usage.usedBytes))} · Mỗi tệp tối đa ${formatSize(usage.maxFileBytes)} · ${usage.fileCount ?? 0}/${usage.maxFiles ?? 200} tệp · Bao gồm thùng rác.`
    : (currentUser ? 'Đang kiểm tra dung lượng tài khoản…' : 'Đăng nhập để xem dung lượng của bạn.');
  updateControls();
}

function clearSelectedFile() {
  selectedFile = null;
  el['file-input'].value = '';
  el['selected-file'].hidden = true;
  el['selected-name'].textContent = '';
  el['selected-meta'].textContent = '';
  el['upload-button'].textContent = 'Tải lên ngay';
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
  verificationSync?.stop();
  generation += 1;
  listRequest += 1;
  listBusy = false;
  if (uploadSession) {
    uploadSession.cancelRequested = true;
    uploadSession.task?.cancel();
    uploadSession = null;
  }
  currentUser = user;
  // A persisted user flag can be newer than its cached ID token. Confirm each
  // restored/signed-in session through reload + forced token refresh first.
  verificationConfirmed = false;
  currentFolderId = null;
  folderItems = [];
  folderBreadcrumbs = [];
  folderRequest += 1;
  clearTimeout(searchTimer);
  serverTotal = 0;
  closePreview();
  closeManager();
  closePasswordReset();
  el['folder-list'].replaceChildren();
  el['folder-breadcrumbs'].replaceChildren();
  feedback(el['folder-feedback']);
  verificationBusy = false;
  feedback(el['verification-feedback']);
  libraryView = 'own';
  viewGeneration += 1;
  closeShareDialog();
  applyLibraryView();
  if (el['delete-dialog'].open) el['delete-dialog'].close('cancel');
  resetPagination();
  el['file-search'].value = '';
  document.getElementById('topbar-search-input').value = '';
  el['file-filter'].value = 'all';
  el['file-sort'].value = 'newest';
  clearSelectedFile();
  clearDownload();
  updateQuota();
  updateSearchScope();
  el['upload-progress'].hidden = true;
  el['progress-bar'].value = 0;
  currentFiles = [];
  el['files-body'].replaceChildren();
  el['file-count'].textContent = '0';
  updateMetrics();
  el.pagination.hidden = true;
  feedback(el['upload-feedback']);
  feedback(el['files-feedback']);
  feedback(el['verify-feedback']);
  el['signed-out-view'].hidden = Boolean(user);
  el['signed-in-view'].hidden = !user;
  el['account-email'].textContent = user?.email || 'Tài khoản Firebase';
  // Update welcome name in topbar
  if (window.__setWelcomeName) {
    const name = user?.email ? user.email.split('@')[0] : 'bạn';
    window.__setWelcomeName(name);
  }
  el['account-uid'].textContent = user?.uid || '';
  el['user-prefix'].textContent = user ? `users/${user.uid}/` : 'Đăng nhập để xem đường dẫn';
  document.querySelector('.topbar-avatar')?.classList.toggle('signed-in', Boolean(user));
  document.getElementById('auth-heading').textContent = user ? 'Tài khoản của bạn' : 'Đăng nhập an toàn';
  el['drop-title'].textContent = user ? 'Thả tệp vào đây' : 'Đăng nhập để tải tệp lên';
  el['auth-description'].textContent = user ? 'Bạn đang sử dụng kho tài liệu riêng của mình.' : 'Dùng email và mật khẩu để mở kho tài liệu cá nhân.';
  el['verify-button'].disabled = !user;
  updateControls();
  if (user) {
    el['file-results-label'].textContent = 'Đang lấy dữ liệu…';
    void loadFilePage();
    if (!verificationConfirmed) void verificationSync?.start(user);
  } else {
    el['file-results-label'].textContent = 'Đăng nhập để xem thư viện';
    showEmpty('Bắt đầu thư viện của bạn', 'Đăng nhập để xem và quản lý tài liệu cá nhân.');
  }
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
    feedback(el['upload-feedback'], file.size === 0 ? 'Tệp rỗng chưa thể tải lên. Hãy chọn tệp có nội dung.' : 'Tệp vượt quá 10 MiB. Hãy chọn tệp nhỏ hơn.', 'error');
    return;
  }
  if (accountUsage && accountUsage.fileCount >= (accountUsage.maxFiles ?? 200)) {
    clearSelectedFile();
    feedback(el['upload-feedback'], 'Đã đạt giới hạn số tài liệu. Xóa vĩnh viễn tài liệu trong thùng rác để tải thêm.', 'error');
    return;
  }
  if (accountUsage && accountUsage.usedBytes + file.size > accountUsage.maxBytes) {
    clearSelectedFile();
    feedback(el['upload-feedback'], 'Dung lượng không đủ. Xóa vĩnh viễn tài liệu trong thùng rác hoặc chọn tệp nhỏ hơn.', 'error');
    return;
  }
  selectedFile = file;
  el['selected-name'].textContent = file.name;
  el['selected-meta'].textContent = `${file.type} · ${formatSize(file.size)}`;
  el['selected-file'].hidden = false;
  updateControls();
}

function fileAction(label, handler, { danger = false, iconName = null } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `file-action${danger ? ' danger' : ''}`;
  if (iconName) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class','icon small');
    icon.setAttribute('aria-hidden','true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${iconName}`);
    icon.append(use);
    button.append(icon);
  }
  button.append(document.createTextNode(label));
  button.addEventListener('click', handler);
  return button;
}

function fileKind(file) {
  return file.contentType === 'application/pdf' ? 'pdf' : 'image';
}

function updateMetrics() {
  if (!currentUser) {
    for (const id of ['stat-total','stat-size','stat-docs','stat-images']) el[id].textContent = '—';
    return;
  }
  el['stat-total'].textContent = String(currentFiles.length);
  el['stat-size'].textContent = formatSize(currentFiles.reduce((n, file) => n + (Number(file.size) || 0), 0));
  el['stat-docs'].textContent = String(currentFiles.filter(file => fileKind(file) === 'pdf').length);
  el['stat-images'].textContent = String(currentFiles.filter(file => fileKind(file) === 'image').length);
}

function fileTypeBadge(file) {
  const kind = fileKind(file);
  const badge = document.createElement('span');
  badge.className = 'file-type-badge';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '20');
  rect.setAttribute('height', '20');
  rect.setAttribute('rx', '3');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '10');
  text.setAttribute('y', '14');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', kind === 'pdf' ? '6' : '5');
  text.setAttribute('font-weight', '700');
  text.setAttribute('fill', 'white');
  text.setAttribute('font-family', 'Arial');
  if (kind === 'pdf') {
    rect.setAttribute('fill', '#e53e3e');
    text.textContent = 'PDF';
  } else {
    const subtype = (file.contentType || '').replace('image/', '').toUpperCase();
    rect.setAttribute('fill', subtype === 'PNG' ? '#38a169' : '#3182ce');
    text.textContent = subtype || 'IMG';
  }
  svg.append(rect, text);
  badge.append(svg);
  return badge;
}

function renderFiles(files, capturedGeneration, uid, capturedView = viewGeneration) {
  const fragment = document.createDocumentFragment();
  for (const file of files) {
    const row = document.createElement('tr');
    row.className = 'file-row';

    // Name cell
    const nameCell = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'file-name-cell';

    // Badge
    const badge = fileTypeBadge(file);

    // Display name
    const displayName = document.createElement('span');
    displayName.className = 'file-display-name';
    const cleanName = displayFileName(file);
    displayName.textContent = cleanName;
    displayName.title = cleanName;

    nameWrap.append(badge, displayName);
    nameCell.append(nameWrap);

    // Size cell
    const sizeCell = document.createElement('td');
    sizeCell.className = 'td-meta';
    sizeCell.textContent = formatSize(file.size);

    // Date cell
    const dateCell = document.createElement('td');
    dateCell.className = 'td-meta';
    dateCell.textContent = formatDate(libraryView === 'trash' ? file.trashedAt : (libraryView === 'shared' ? file.sharedAt || file.updated : file.updated));

    // Owner cell
    const ownerCell = document.createElement('td');
    const ownerWrap = document.createElement('div');
    ownerWrap.className = 'owner-cell';
    const ownerAvatar = document.createElement('span');
    ownerAvatar.className = 'owner-avatar';
    ownerAvatar.setAttribute('aria-hidden', 'true');
    const emailInitial = ((libraryView === 'shared' ? file.ownerEmail : currentUser?.email) || 'M').charAt(0).toUpperCase();
    ownerAvatar.textContent = emailInitial;
    const ownerName = document.createElement('span');
    ownerName.textContent = libraryView === 'shared' ? file.ownerEmail || 'Chủ sở hữu' : 'Tôi';
    ownerWrap.append(ownerAvatar, ownerName);
    ownerCell.append(ownerWrap);

    // Access cell
    const accessCell = document.createElement('td');
    accessCell.className = 'td-access';
    const accessBadge = document.createElement('span');
    accessBadge.className = 'access-badge';
    accessBadge.textContent = libraryView === 'shared' ? 'Chỉ xem / tải' : libraryView === 'trash' ? 'Đã ngừng chia sẻ' : file.shareCount > 0 ? `Đã chia sẻ (${file.shareCount})` : 'Riêng tư';
    accessCell.append(accessBadge);

    // Action cell (hidden actions on hover or via context)
    const actionCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'file-actions';
    if (libraryView === 'trash') {
      actions.append(
        fileAction('Khôi phục', (event) => void restoreOwnedFile(file, event.currentTarget, capturedGeneration, uid, capturedView), { iconName: 'ic-refresh' }),
        fileAction('Xóa vĩnh viễn', (event) => void deleteFile(file, event.currentTarget, capturedGeneration, uid, capturedView, true), { danger: true, iconName: 'ic-trash' }),
      );
    } else {
      actions.append(fileAction('Xem trước', (event) => void openPreview(file, capturedGeneration, uid, capturedView), { iconName: 'ic-eye' }));
      actions.append(fileAction('Tải xuống', (event) => void downloadOwnedFile(file, event.currentTarget, capturedGeneration, uid, capturedView), { iconName: 'ic-arrow' }));
      if (libraryView === 'own') {
        actions.append(
          fileAction('Đổi tên', () => void openManager('rename-file', file), { iconName: 'ic-files' }),
          fileAction('Di chuyển', () => void openManager('move-file', file), { iconName: 'ic-folder' }),
          fileAction('Chia sẻ', (event) => void openShareDialog(file, capturedGeneration, uid, capturedView), { iconName: 'ic-share' }),
          fileAction('Vào thùng rác', (event) => void deleteFile(file, event.currentTarget, capturedGeneration, uid, capturedView, false), { danger: true, iconName: 'ic-trash' }),
        );
      }
    }
    for (const button of actions.children) button.setAttribute('aria-label', `${button.textContent}: ${cleanName}`);
    actionCell.append(actions);

    row.append(nameCell, sizeCell, dateCell, ownerCell, accessCell, actionCell);
    fragment.append(row);
  }
  el['files-body'].replaceChildren(fragment);
}

function applyFileFilters() {
  if (!currentUser) return;
  el['file-results-label'].textContent = `${currentFiles.length} / ${serverTotal} tài liệu · Trang ${currentPage + 1}`;
  renderFiles(currentFiles, generation, currentUser.uid);
  updateSearchScope();
  if (currentFiles.length) {
    el['files-empty'].hidden = true;
    el['files-table-wrap'].hidden = false;
  } else if (el['file-search'].value.trim() || el['file-filter'].value !== 'all') {
    showEmpty('Không tìm thấy tài liệu phù hợp', 'Thử từ khóa khác hoặc bỏ bộ lọc. Kết quả được tìm trong toàn bộ danh sách đã chọn.');
  } else {
    const emptyStates = {
      own: ['Thư mục chưa có tài liệu', 'Tạo thư mục hoặc tải tài liệu vào thư mục đang mở.'],
      shared: ['Chưa có tài liệu được chia sẻ', 'Tài liệu sẽ xuất hiện khi chủ sở hữu chia sẻ cho email tài khoản của bạn.'],
      trash: ['Thùng rác đang trống', 'Tài liệu bạn đưa vào thùng rác sẽ xuất hiện ở đây.'],
    };
    showEmpty(...emptyStates[libraryView]);
  }
}

function updateSearchScope() {
  const searching = Boolean(el['file-search'].value.trim());
  el['search-scope'].textContent = libraryView === 'own'
    ? (searching ? 'Tìm trong toàn bộ tài liệu của tôi, bao gồm mọi thư mục.' : 'Đang xem tài liệu trực tiếp trong thư mục đang mở.')
    : libraryView === 'shared' ? 'Tìm, lọc và sắp xếp trên toàn bộ tài liệu được chia sẻ với tôi.' : 'Tìm, lọc và sắp xếp trên toàn bộ thùng rác.';
  el['folder-list'].hidden = libraryView !== 'own' || searching;
}

function changeQuery(immediate = false) {
  if (!currentUser) return;
  clearTimeout(searchTimer);
  viewGeneration += 1;
  listRequest += 1;
  folderRequest += 1;
  listBusy = false;
  closePreview();
  closeManager();
  closeShareDialog();
  if (el['delete-dialog'].open) el['delete-dialog'].close('cancel');
  resetPagination();
  currentFiles = [];
  el['files-body'].replaceChildren();
  el.pagination.hidden = true;
  showEmpty('Đang tìm tài liệu…', 'Kết quả đang được cập nhật.');
  updateSearchScope();
  updateControls();
  const capturedGeneration = generation;
  const capturedView = viewGeneration;
  const uid = currentUser.uid;
  const run = () => { if (sameLibrary(capturedGeneration, uid, capturedView)) void loadFilePage(); };
  if (immediate) run();
  else searchTimer = setTimeout(run, 300);
}

async function loadFilePage() {
  if (!currentUser) return false;
  const capturedGeneration = generation;
  const uid = currentUser.uid;
  const request = ++listRequest;
  const capturedView = viewGeneration;
  listBusy = true;
  feedback(el['files-feedback'], 'Đang lấy danh sách tệp…', 'neutral');
  updateControls();
  try {
    if (libraryView === 'own') void loadFolderPage();
    const result = await listFiles(pageTokens[currentPage], libraryView, {
      q: el['file-search'].value.trim(), type: el['file-filter'].value, sort: el['file-sort'].value, folderId: currentFolderId,
    });
    if (!sameLibrary(capturedGeneration, uid, capturedView) || request !== listRequest) return false;
    const files = result.files || [];
    serverTotal = Number.isSafeInteger(result.total) ? result.total : files.length;
    nextPageToken = result.nextPageToken;
    currentFiles = files;
    updateQuota(result.usage);
    updateMetrics();
    el['file-count'].textContent = String(files.length);
    el['page-label'].textContent = `Trang ${currentPage + 1} · ${files.length} tệp`;
    el.pagination.hidden = files.length === 0 && currentPage === 0 && !nextPageToken;
    applyFileFilters();
    if (!files.length && currentPage > 0) showEmpty('Trang này chưa có tệp', 'Quay về trang trước hoặc làm mới danh sách.');
    feedback(el['files-feedback']);
    return true;
  } catch (error) {
    if (!sameLibrary(capturedGeneration, uid, capturedView) || request !== listRequest) return false;
    nextPageToken = undefined;
    currentFiles = [];
    updateQuota();
    el['quota-message'].textContent = 'Chưa xác định được dung lượng. Hãy làm mới danh sách.';
    updateMetrics();
    el['file-results-label'].textContent = 'Chưa thể tải danh sách';
    el['files-body'].replaceChildren();
    el['file-count'].textContent = '0';
    showEmpty('Chưa tải được danh sách', 'Kiểm tra kết nối rồi chọn Làm mới.');
    feedback(el['files-feedback'], friendlyError(error), 'error');
    return false;
  } finally {
    if (sameLibrary(capturedGeneration, uid, capturedView) && request === listRequest) {
      listBusy = false;
      updateControls();
    }
  }
}

async function downloadOwnedFile(file, button, capturedGeneration, uid, capturedView) {
  if (!sameLibrary(capturedGeneration, uid, capturedView)) return;
  const request = ++downloadRequest;
  button.disabled = true;
  feedback(el['download-feedback'], `Đang tải ${file.name}…`, 'neutral');
  try {
    const blob = await downloadFile(file.fullPath, libraryView === 'shared' ? file.ownerUid : null);
    if (!sameLibrary(capturedGeneration, uid, capturedView) || request !== downloadRequest) return;
    const localURL = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = localURL;
    link.download = displayFileName(file);
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(localURL), 1000);
    feedback(el['download-feedback'], `Đã gửi ${link.download} tới trình duyệt để lưu.`);
  } catch (error) {
    if (sameLibrary(capturedGeneration, uid, capturedView) && request === downloadRequest) feedback(el['download-feedback'], friendlyError(error), 'error');
  } finally {
    if (sameUser(capturedGeneration, uid)) button.disabled = false;
  }
}

async function confirmDeletion(file, permanent) {
  const dialog = el['delete-dialog'];
  const description = permanent
    ? 'Tài liệu sẽ bị xóa vĩnh viễn và không thể khôi phục.'
    : 'Tài liệu vẫn chiếm dung lượng và có thể khôi phục. Mọi quyền chia sẻ sẽ bị thu hồi.';
  if (typeof dialog.showModal !== 'function') return window.confirm(description);
  document.getElementById('delete-heading').textContent = permanent ? 'Xóa vĩnh viễn tài liệu?' : 'Chuyển vào thùng rác?';
  document.getElementById('delete-description').textContent = description;
  document.getElementById('confirm-delete').textContent = permanent ? 'Xóa vĩnh viễn' : 'Chuyển vào thùng rác';
  el['delete-filename'].textContent = displayFileName(file);
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

function displayFileName(file) {
  return file.displayName || file.name.replace(/^[0-9a-f]{8}-[0-9a-f-]{27,}-/i, '');
}

async function deleteFile(file, button, capturedGeneration, uid, capturedView, permanent) {
  if (!sameLibrary(capturedGeneration, uid, capturedView)) return;
  if (!await confirmDeletion(file, permanent)) return;
  if (!sameLibrary(capturedGeneration, uid, capturedView)) return;
  button.disabled = true;
  try {
    await (permanent ? removeFile : trashFile)(file.fullPath);
    if (!sameLibrary(capturedGeneration, uid, capturedView)) return;
    clearDownload();
    resetPagination();
    const reloaded = await loadFilePage();
    if (sameLibrary(capturedGeneration, uid, capturedView) && reloaded) feedback(el['files-feedback'], permanent
      ? `Đã xóa vĩnh viễn ${displayFileName(file)}.`
      : `Đã chuyển ${displayFileName(file)} vào thùng rác và thu hồi quyền chia sẻ.`);
  } catch (error) {
    if (sameLibrary(capturedGeneration, uid, capturedView)) feedback(el['files-feedback'], friendlyError(error), 'error');
  } finally {
    if (sameLibrary(capturedGeneration, uid, capturedView)) button.disabled = false;
  }
}

async function restoreOwnedFile(file, button, capturedGeneration, uid, capturedView) {
  if (!sameLibrary(capturedGeneration, uid, capturedView)) return;
  button.disabled = true;
  try {
    await restoreFile(file.fullPath);
    if (!sameLibrary(capturedGeneration, uid, capturedView)) return;
    resetPagination();
    await loadFilePage();
    if (sameLibrary(capturedGeneration, uid, capturedView)) feedback(el['files-feedback'], `Đã khôi phục ${displayFileName(file)} về tài liệu riêng tư. Quyền chia sẻ cũ không được khôi phục.`);
  } catch (error) {
    if (sameLibrary(capturedGeneration, uid, capturedView)) feedback(el['files-feedback'], friendlyError(error), 'error');
  } finally {
    if (sameLibrary(capturedGeneration, uid, capturedView)) button.disabled = false;
  }
}

function currentShareContext(context) {
  return shareContext === context && el['share-dialog'].open && libraryView === 'own'
    && sameLibrary(context.generation, context.uid, context.viewGeneration);
}

function updateShareControls() {
  el['share-email'].disabled = shareBusy;
  el['share-submit'].disabled = shareBusy;
  el['share-refresh'].disabled = shareBusy;
  for (const button of el['share-recipients'].querySelectorAll('button')) button.disabled = shareBusy;
}

function renderShares(shares, context) {
  const fragment = document.createDocumentFragment();
  if (!shares.length) {
    const empty = document.createElement('li');
    empty.className = 'share-empty';
    empty.textContent = 'Chưa chia sẻ tài liệu này với ai.';
    fragment.append(empty);
  }
  for (const share of shares) {
    const item = document.createElement('li');
    item.className = 'share-recipient';
    const details = document.createElement('div');
    const email = document.createElement('strong');
    email.textContent = share.email;
    const permission = document.createElement('span');
    permission.textContent = 'Xem và tải xuống';
    details.append(email, permission);
    const button = fileAction('Thu hồi', () => void removeRecipient(share, context), { danger: true });
    button.setAttribute('aria-label', `Thu hồi: ${share.email}`);
    item.append(details, button);
    fragment.append(item);
  }
  el['share-recipients'].replaceChildren(fragment);
  const ownFile = currentFiles.find(file => file.fullPath === context.file.fullPath);
  if (ownFile) {
    ownFile.shareCount = shares.length;
    applyFileFilters();
  }
}

async function loadShares(context) {
  if (!currentShareContext(context)) return false;
  const request = ++shareRequest;
  shareBusy = true;
  updateShareControls();
  feedback(el['share-feedback'], 'Đang lấy danh sách người nhận…', 'neutral');
  try {
    const shares = await getShares(context.file.fullPath);
    if (!currentShareContext(context) || request !== shareRequest) return false;
    renderShares(shares, context);
    feedback(el['share-feedback']);
    return true;
  } catch (error) {
    if (currentShareContext(context) && request === shareRequest) feedback(el['share-feedback'], friendlyError(error), 'error');
    return false;
  } finally {
    if (currentShareContext(context) && request === shareRequest) {
      shareBusy = false;
      updateShareControls();
    }
  }
}

async function openShareDialog(file, capturedGeneration, uid, capturedView) {
  if (!sameLibrary(capturedGeneration, uid, capturedView) || libraryView !== 'own') return;
  closeShareDialog();
  const context = { file, generation: capturedGeneration, uid, viewGeneration: capturedView };
  shareContext = context;
  el['share-filename'].textContent = displayFileName(file);
  el['share-dialog'].showModal();
  await loadShares(context);
  if (currentShareContext(context)) el['share-email'].focus();
}

async function removeRecipient(share, context) {
  if (!currentShareContext(context) || shareBusy) return;
  shareBusy = true;
  updateShareControls();
  try {
    await revokeShare(context.file.fullPath, share.recipientUid);
    if (!currentShareContext(context)) return;
    if (await loadShares(context)) feedback(el['share-feedback'], `Đã thu hồi quyền của ${share.email}.`);
  } catch (error) {
    if (currentShareContext(context)) feedback(el['share-feedback'], friendlyError(error), 'error');
  } finally {
    if (currentShareContext(context)) { shareBusy = false; updateShareControls(); }
  }
}

el['share-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const context = shareContext;
  if (!context || !currentShareContext(context) || shareBusy || !el['share-form'].reportValidity()) return;
  const email = el['share-email'].value.trim();
  shareBusy = true;
  updateShareControls();
  feedback(el['share-feedback'], 'Đang cấp quyền xem và tải xuống…', 'neutral');
  try {
    await grantShare(context.file.fullPath, email);
    if (!currentShareContext(context)) return;
    el['share-email'].value = '';
    if (await loadShares(context)) feedback(el['share-feedback'], `Đã chia sẻ cho ${email}.`);
  } catch (error) {
    if (currentShareContext(context)) feedback(el['share-feedback'], friendlyError(error), 'error');
  } finally {
    if (currentShareContext(context)) { shareBusy = false; updateShareControls(); }
  }
});
el['share-close'].addEventListener('click', closeShareDialog);
el['share-refresh'].addEventListener('click', () => { if (shareContext) void loadShares(shareContext); });
el['share-dialog'].addEventListener('cancel', (event) => { event.preventDefault(); closeShareDialog(); });
el['share-dialog'].addEventListener('close', () => { if (shareContext && !el['share-dialog'].open) closeShareDialog(); });

for (const control of document.querySelectorAll('[data-library-view]')) {
  control.addEventListener('click', () => switchLibraryView(control.dataset.libraryView));
  if (control.getAttribute('role') === 'tab') {
    control.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const views = ['own', 'shared', 'trash'];
      const index = views.indexOf(libraryView);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      switchLibraryView(views[next]);
      document.querySelector(`[role="tab"][data-library-view="${views[next]}"]`).focus();
    });
  }
}

el['file-search'].addEventListener('input', () => {
  document.getElementById('topbar-search-input').value = el['file-search'].value;
  changeQuery(false);
});
for (const id of ['file-filter','file-sort']) el[id].addEventListener('change', () => changeQuery(true));

el['toggle-password'].addEventListener('click', () => {
  const showing = el.password.type === 'password';
  el.password.type = showing ? 'text' : 'password';
  el['toggle-password'].setAttribute('aria-pressed', String(showing));
  el['toggle-password'].setAttribute('aria-label', showing ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
});

for (const link of document.querySelectorAll('.main-nav .nav-item')) {
  link.addEventListener('click', () => {
    if (!link.dataset.libraryView) return;
    applyLibraryView();
  });
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
    const result = await (action === 'login' ? login : register)(el.email.value.trim(), el.password.value);
    if (getCurrentUser() !== result.user) return;
    el.password.value = '';
    feedback(el['auth-feedback'], action === 'login' ? 'Đăng nhập thành công.' : 'Đã tạo tài khoản và đăng nhập.');
    if (result.verificationEmail && !verificationConfirmed) {
      feedback(el['verification-feedback'], result.verificationEmail.sent
        ? (result.verificationEmail.mode === 'emulator'
          ? 'Đã tạo email xác minh cục bộ trong Auth Emulator. Trạng thái sẽ tự cập nhật sau khi bạn xác minh.'
          : 'Đã tự động gửi email xác minh. Mở liên kết trong email; trạng thái sẽ tự cập nhật.')
        : 'Tài khoản đã tạo thành công nhưng chưa gửi được email xác minh. ' + friendlyError(result.verificationEmail.error),
        result.verificationEmail.sent ? 'success' : 'error');
    }
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

el['send-verification'].addEventListener('click', async () => {
  if (!currentUser || verificationBusy || authBusy || verificationConfirmed
      || getVerificationRetryAt(currentUser.uid) > Date.now()) return;
  const capturedGeneration = generation;
  const uid = currentUser.uid;
  verificationBusy = true;
  updateVerification();
  feedback(el['verification-feedback'], 'Đang gửi email xác minh…', 'neutral');
  try {
    const result = await sendVerification();
    if (sameUser(capturedGeneration, uid) && !verificationConfirmed) feedback(el['verification-feedback'],
      result.mode === 'emulator' ? 'Đã tạo email xác minh cục bộ. Trạng thái sẽ tự cập nhật.'
        : 'Đã gửi lại email. Mở liên kết trong email; trạng thái sẽ tự cập nhật.');
  } catch (error) {
    if (sameUser(capturedGeneration, uid)) feedback(el['verification-feedback'], friendlyError(error), 'error');
  } finally {
    if (sameUser(capturedGeneration, uid)) { verificationBusy = false; updateVerification(); }
  }
});

function syncVerificationNow() {
  updateVerification();
  if (currentUser && !verificationConfirmed) void verificationSync?.check();
}
window.addEventListener('focus', syncVerificationNow);
window.addEventListener('online', syncVerificationNow);
document.addEventListener('visibilitychange', syncVerificationNow);
window.addEventListener('pagehide', () => verificationSync?.stop());
window.addEventListener('pageshow', () => {
  if (currentUser && !verificationConfirmed) void verificationSync?.start(currentUser);
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
  const uploadFolderId = libraryView === 'own' ? currentFolderId : null;
  const session = { task: null, cancelRequested: false };
  uploadSession = session;
  feedback(el['upload-feedback']);
  el['upload-progress'].hidden = false;
  el['progress-bar'].value = 0;
  el['progress-label'].textContent = 'Đang tải lên… 0%';
  el['cancel-upload'].disabled = false;
  el['upload-button'].textContent = 'Đang tải lên…';
  updateControls();
  try {
    const job = await uploadFile(file, (progress) => {
      if (!sameUser(capturedGeneration, uid) || uploadSession !== session) return;
      const percent = typeof progress === 'number' ? progress : ((progress?.bytesTransferred || 0) / (progress?.totalBytes || file.size)) * 100;
      const bounded = Math.max(0, Math.min(100, Math.round(percent)));
      el['progress-bar'].value = bounded;
      el['progress-label'].textContent = bounded === 100 ? 'Đã gửi 100% · Máy chủ đang kiểm tra và lưu tệp…' : `Đang tải lên… ${bounded}%`;
    }, uploadFolderId);
    session.task = job.task;
    if (session.cancelRequested || !sameUser(capturedGeneration, uid)) session.task?.cancel();
    await job.completed;
    if (!sameUser(capturedGeneration, uid) || uploadSession !== session) return;
    clearSelectedFile();
    feedback(el['upload-feedback'], `Đã tải lên ${file.name}.`);
    resetPagination();
    await loadFilePage();
  } catch (error) {
    if (sameUser(capturedGeneration, uid) && uploadSession === session) {
      // Retain selection for retry and reconcile an uncertain save after abort/network loss.
      el['upload-button'].textContent = 'Thử tải lại';
      feedback(el['upload-feedback'], friendlyError(error), error?.code === 'storage/canceled' ? 'neutral' : 'error');
      resetPagination();
      await loadFilePage();
    }
  } finally {
    if (uploadSession === session) {
      uploadSession = null;
      el['upload-progress'].hidden = true;
      if (!selectedFile) el['upload-button'].textContent = 'Tải lên ngay';
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
document.getElementById('topbar-search-input').addEventListener('input', (event) => {
  el['file-search'].value = event.target.value;
  changeQuery(false);
});
document.getElementById('create-new-btn').addEventListener('click', () => {
  document.getElementById(currentUser ? 'upload-area' : 'auth-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (currentUser && !uploadSession) el['file-input'].click();
});


function renderBreadcrumbs() {
  const fragment = document.createDocumentFragment();
  const capturedGeneration = generation;
  const capturedView = viewGeneration;
  const uid = currentUser?.uid;
  for (const folder of [{ id: null, name: 'Tài liệu của tôi' }, ...folderBreadcrumbs]) {
    if (fragment.childNodes.length) {
      const separator = document.createElement('span');
      separator.textContent = '/';
      separator.setAttribute('aria-hidden', 'true');
      fragment.append(separator);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = folder.name;
    button.className = 'breadcrumb-button';
    if (folder.id === currentFolderId) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => {
      if (sameLibrary(capturedGeneration, uid, capturedView)) navigateFolder(folder.id);
    });
    fragment.append(button);
  }
  el['folder-breadcrumbs'].replaceChildren(fragment);
  const destination = folderBreadcrumbs.at(-1)?.name || 'Thư mục gốc';
  document.getElementById('upload-help').textContent = '10 MiB/tệp · 50 MiB/tài khoản · Tải vào: ' + (libraryView === 'own' ? destination : 'Thư mục gốc') + '.';
}

function renderFolders() {
  const fragment = document.createDocumentFragment();
  const capturedGeneration = generation;
  const capturedView = viewGeneration;
  const uid = currentUser?.uid;
  for (const folder of folderItems) {
    const card = document.createElement('article');
    card.className = 'folder-item';
    const open = fileAction(folder.name, () => {
      if (sameLibrary(capturedGeneration, uid, capturedView)) navigateFolder(folder.id);
    }, { iconName: 'ic-folder' });
    open.className = 'folder-open';
    open.setAttribute('aria-label', 'Mở thư mục: ' + folder.name);
    const actions = document.createElement('div');
    actions.className = 'folder-actions';
    for (const [kind, label] of [['rename-folder', 'Đổi tên'], ['move-folder', 'Di chuyển'], ['delete-folder', 'Xóa thư mục trống']]) {
      const button = fileAction(label, () => {
        if (sameLibrary(capturedGeneration, uid, capturedView)) void openManager(kind, folder);
      }, { danger: kind === 'delete-folder' });
      button.setAttribute('aria-label', label + ' thư mục: ' + folder.name);
      actions.append(button);
    }
    card.append(open, actions);
    fragment.append(card);
  }
  el['folder-list'].replaceChildren(fragment);
  updateSearchScope();
}

async function loadFolderPage() {
  if (!currentUser || libraryView !== 'own') return;
  const capturedGeneration = generation;
  const capturedView = viewGeneration;
  const uid = currentUser.uid;
  const request = ++folderRequest;
  renderBreadcrumbs();
  try {
    const data = await listFolders(currentFolderId);
    if (!sameLibrary(capturedGeneration, uid, capturedView) || request !== folderRequest) return;
    folderItems = data.folders || [];
    folderBreadcrumbs = data.breadcrumbs || [];
    renderBreadcrumbs();
    renderFolders();
    feedback(el['folder-feedback']);
  } catch (error) {
    if (sameLibrary(capturedGeneration, uid, capturedView) && request === folderRequest) feedback(el['folder-feedback'], friendlyError(error), 'error');
  }
}

function navigateFolder(id) {
  if (!currentUser) return;
  currentFolderId = id || null;
  folderItems = [];
  folderBreadcrumbs = [];
  el['file-search'].value = '';
  document.getElementById('topbar-search-input').value = '';
  renderBreadcrumbs();
  renderFolders();
  changeQuery(true);
}

function closeManager() {
  managerContext = null;
  managerBusy = false;
  if (el['manager-dialog'].open) el['manager-dialog'].close();
  el['manager-name'].value = '';
  el['manager-target'].replaceChildren();
  feedback(el['manager-feedback']);
}

function currentManagerContext(context) {
  return managerContext === context && el['manager-dialog'].open && libraryView === 'own'
    && sameLibrary(context.generation, context.uid, context.viewGeneration);
}

function updateManagerControls() {
  const context = managerContext;
  const moving = context?.kind.startsWith('move-');
  const naming = context?.kind === 'new-folder' || context?.kind.startsWith('rename-');
  el['manager-name'].disabled = managerBusy || !naming;
  el['manager-target'].disabled = managerBusy || !moving;
  el['manager-submit'].disabled = managerBusy;
}

function folderPath(folder, map) {
  const parts = [];
  const seen = new Set();
  let cursor = folder;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    parts.unshift(cursor.name);
    cursor = map.get(cursor.parentId);
  }
  return parts.join(' / ');
}

function fillFolderChoices(folders, context) {
  const map = new Map(folders.map(folder => [folder.id, folder]));
  const choices = folders.filter(folder => {
    if (context.kind !== 'move-folder') return true;
    const seen = new Set();
    let cursor = folder;
    while (cursor && !seen.has(cursor.id)) {
      if (cursor.id === context.item.id) return false;
      seen.add(cursor.id);
      cursor = map.get(cursor.parentId);
    }
    return true;
  }).map(folder => ({ id: folder.id, path: folderPath(folder, map) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'vi'));
  const fragment = document.createDocumentFragment();
  for (const choice of [{ id: '', path: 'Thư mục gốc' }, ...choices]) {
    const option = document.createElement('option');
    option.value = choice.id;
    option.textContent = choice.path;
    fragment.append(option);
  }
  el['manager-target'].replaceChildren(fragment);
  el['manager-target'].value = (context.kind === 'move-folder' ? context.item.parentId : context.item.folderId) || '';
}

async function openManager(kind, item = null) {
  if (!currentUser || libraryView !== 'own') return;
  closeManager();
  const context = { kind, item, parentId: currentFolderId, generation, uid: currentUser.uid, viewGeneration };
  managerContext = context;
  const titles = { 'new-folder': 'Tạo thư mục', 'rename-folder': 'Đổi tên thư mục', 'move-folder': 'Di chuyển thư mục', 'delete-folder': 'Xóa thư mục trống', 'rename-file': 'Đổi tên tài liệu', 'move-file': 'Di chuyển tài liệu' };
  const moving = kind.startsWith('move-');
  const naming = kind === 'new-folder' || kind.startsWith('rename-');
  el['manager-heading'].textContent = titles[kind];
  el['manager-description'].textContent = kind === 'delete-folder'
    ? 'Chỉ xóa được thư mục không chứa thư mục con hay tài liệu, kể cả tài liệu trong thùng rác.'
    : kind === 'new-folder' ? 'Thư mục chỉ tổ chức tài liệu. Quyền chia sẻ được cấp riêng cho từng tài liệu.'
    : 'Đổi tên hoặc di chuyển sẽ giữ nguyên tài liệu và quyền chia sẻ đã cấp.';
  el['manager-name-field'].hidden = !naming;
  el['manager-name'].required = naming;
  el['manager-name'].value = kind === 'new-folder' ? '' : item ? (kind.endsWith('-file') ? displayFileName(item) : item.name) : '';
  el['manager-target-field'].hidden = !moving;
  el['manager-target'].required = false;
  el['manager-submit'].textContent = kind === 'delete-folder' ? 'Xóa thư mục trống' : kind === 'new-folder' ? 'Tạo thư mục' : 'Lưu thay đổi';
  el['manager-submit'].classList.toggle('button-danger', kind === 'delete-folder');
  el['manager-submit'].classList.toggle('button-primary', kind !== 'delete-folder');
  managerBusy = moving;
  updateManagerControls();
  el['manager-dialog'].showModal();
  if (moving) {
    feedback(el['manager-feedback'], 'Đang lấy danh sách thư mục…', 'neutral');
    try {
      const data = await listFolders(null, true);
      if (!currentManagerContext(context)) return;
      fillFolderChoices(data.folders || [], context);
      feedback(el['manager-feedback']);
    } catch (error) {
      if (currentManagerContext(context)) {
        feedback(el['manager-feedback'], friendlyError(error) + ' Đóng và mở lại để thử lại.', 'error');
        return;
      }
    } finally {
      if (currentManagerContext(context)) { managerBusy = false; updateManagerControls(); }
    }
  }
  if (currentManagerContext(context)) (moving ? el['manager-target'] : naming ? el['manager-name'] : el['manager-submit']).focus();
}

el['manager-form'].addEventListener('submit', async event => {
  event.preventDefault();
  const context = managerContext;
  if (!context || !currentManagerContext(context) || managerBusy || !el['manager-form'].reportValidity()) return;
  if (context.kind.startsWith('move-') && !el['manager-target'].options.length) return;
  managerBusy = true;
  updateManagerControls();
  feedback(el['manager-feedback'], 'Đang lưu thay đổi…', 'neutral');
  const name = el['manager-name'].value.trim();
  const target = el['manager-target'].value || null;
  try {
    if (context.kind === 'new-folder') await createFolder(name, context.parentId);
    else if (context.kind === 'rename-folder') await updateFolder(context.item.id, { name });
    else if (context.kind === 'move-folder') await updateFolder(context.item.id, { parentId: target });
    else if (context.kind === 'delete-folder') await deleteFolder(context.item.id);
    else if (context.kind === 'rename-file') await updateFile(context.item.fullPath, { displayName: name });
    else if (context.kind === 'move-file') await updateFile(context.item.fullPath, { folderId: target });
    if (!currentManagerContext(context)) return;
    closeManager();
    resetPagination();
    await loadFilePage();
    if (sameLibrary(context.generation, context.uid, context.viewGeneration)) feedback(el['files-feedback'], 'Đã lưu thay đổi.');
  } catch (error) {
    if (currentManagerContext(context)) feedback(el['manager-feedback'], friendlyError(error), 'error');
  } finally {
    if (currentManagerContext(context)) { managerBusy = false; updateManagerControls(); }
  }
});
el['manager-close'].addEventListener('click', closeManager);
el['manager-dialog'].addEventListener('cancel', event => { event.preventDefault(); closeManager(); });
el['manager-dialog'].addEventListener('close', () => { if (managerContext && !el['manager-dialog'].open) closeManager(); });
el['new-folder'].addEventListener('click', () => void openManager('new-folder'));

function closePreview() {
  previewContext = null;
  disposePdfPreview?.();
  disposePdfPreview = null;
  el['preview-content'].replaceChildren();
  if (previewObjectURL) URL.revokeObjectURL(previewObjectURL);
  previewObjectURL = null;
  if (el['preview-dialog'].open) el['preview-dialog'].close();
  feedback(el['preview-feedback']);
}

function currentPreviewContext(context) {
  return previewContext === context && el['preview-dialog'].open
    && sameLibrary(context.generation, context.uid, context.viewGeneration);
}

async function openPreview(file, capturedGeneration, uid, capturedView) {
  if (!sameLibrary(capturedGeneration, uid, capturedView) || libraryView === 'trash') return;
  closePreview();
  const context = { file, generation: capturedGeneration, uid, viewGeneration: capturedView, ownerUid: libraryView === 'shared' ? file.ownerUid : null };
  previewContext = context;
  el['preview-heading'].textContent = displayFileName(file);
  el['preview-download'].disabled = true;
  feedback(el['preview-feedback'], 'Đang tải bản xem trước…', 'neutral');
  el['preview-dialog'].showModal();
  try {
    const blob = await previewFile(file.fullPath, context.ownerUid);
    if (!currentPreviewContext(context)) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('Định dạng này chưa hỗ trợ xem trước.');
    let content;
    if (blob.type === 'application/pdf') {
      const { createPdfPreview } = await import('./pdf-preview.js');
      if (!currentPreviewContext(context)) return;
      disposePdfPreview = createPdfPreview(blob, el['preview-content'], () => currentPreviewContext(context), error => {
        if (currentPreviewContext(context)) feedback(el['preview-feedback'], friendlyError(error), 'error');
      });
    } else {
      previewObjectURL = URL.createObjectURL(blob);
      content = document.createElement('img');
      content.alt = 'Xem trước: ' + displayFileName(file);
      content.src = previewObjectURL;
    }
    if (content) { content.className = 'preview-document'; el['preview-content'].replaceChildren(content); }
    el['preview-download'].disabled = false;
    feedback(el['preview-feedback'], 'Bản xem trước được tải bằng quyền truy cập hiện tại của bạn.');
  } catch (error) {
    if (currentPreviewContext(context)) feedback(el['preview-feedback'], friendlyError(error), 'error');
  }
}
el['preview-close'].addEventListener('click', closePreview);
el['preview-dialog'].addEventListener('cancel', event => { event.preventDefault(); closePreview(); });
el['preview-dialog'].addEventListener('close', () => { if (previewContext && !el['preview-dialog'].open) closePreview(); });
el['preview-download'].addEventListener('click', event => {
  const context = previewContext;
  if (context && currentPreviewContext(context)) void downloadOwnedFile(context.file, event.currentTarget, context.generation, context.uid, context.viewGeneration);
});

function closePasswordReset() {
  resetRequest += 1;
  resetBusy = false;
  if (el['reset-dialog'].open) el['reset-dialog'].close();
  el['reset-email'].value = '';
  el['reset-submit'].disabled = false;
  el['reset-email'].disabled = false;
  feedback(el['reset-feedback']);
}
el['forgot-password'].addEventListener('click', () => {
  if (!initialized || currentUser) return;
  closePasswordReset();
  el['reset-email'].value = el.email.value.trim();
  el['reset-dialog'].showModal();
  el['reset-email'].focus();
});
el['reset-form'].addEventListener('submit', async event => {
  event.preventDefault();
  if (currentUser || resetBusy || !el['reset-form'].reportValidity()) return;
  const request = ++resetRequest;
  const capturedGeneration = generation;
  resetBusy = true;
  el['reset-submit'].disabled = true;
  el['reset-email'].disabled = true;
  feedback(el['reset-feedback'], 'Đang xử lý yêu cầu…', 'neutral');
  try {
    const result = await resetPassword(el['reset-email'].value.trim());
    if (generation !== capturedGeneration || request !== resetRequest || currentUser || !el['reset-dialog'].open) return;
    feedback(el['reset-feedback'], result.mode === 'emulator'
      ? 'Nếu email đã đăng ký, yêu cầu đặt lại mật khẩu đã được tạo. Khi chạy cục bộ, mở Auth Emulator UI để kiểm tra email thử nghiệm.'
      : 'Nếu email đã đăng ký, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu. Hãy kiểm tra hộp thư và thư rác.');
  } catch (error) {
    if (generation === capturedGeneration && request === resetRequest && !currentUser && el['reset-dialog'].open) feedback(el['reset-feedback'], friendlyError(error), 'error');
  } finally {
    if (generation === capturedGeneration && request === resetRequest && !currentUser && el['reset-dialog'].open) {
      resetBusy = false;
      el['reset-submit'].disabled = false;
      el['reset-email'].disabled = false;
    }
  }
});
el['reset-close'].addEventListener('click', closePasswordReset);
el['reset-dialog'].addEventListener('cancel', event => { event.preventDefault(); closePasswordReset(); });
el['reset-dialog'].addEventListener('close', () => { if (!el['reset-dialog'].open) closePasswordReset(); });

try {
  const client = await import('./firebase-client.js');
  const config = await client.ready;
  const [authentication, files] = await Promise.all([import('./auth.js'), import('./storage.js')]);
  ({ watchAuth, register, login, logout, getCurrentUser, verifyWithBackend, sendVerification, refreshVerification, resetPassword, getVerificationRetryAt } = authentication);
  const { createVerificationSync } = await import('./verification-sync.js');
  verificationSync = createVerificationSync({
    getUser: getCurrentUser, refresh: refreshVerification,
    isVisible: () => document.visibilityState === 'visible',
    onVerified: (result, user) => {
      if (currentUser !== user) return;
      verificationConfirmed = true;
      verificationBusy = false;
      updateVerification();
      feedback(el['verification-feedback'], 'Email đã được xác minh. Quyền truy cập đã được cập nhật tự động.');
    },
    onError: (error, user) => {
      if (currentUser === user && !verificationConfirmed) feedback(el['verification-feedback'],
        'Chưa đồng bộ được trạng thái xác minh. Ứng dụng sẽ tự thử lại khi có kết nối.', 'neutral');
    },
  });
  ({ uploadFile, listFiles, downloadFile, previewFile, removeFile, trashFile, restoreFile, getShares, grantShare, revokeShare, listFolders, createFolder, updateFolder, deleteFolder, updateFile, createUploadQueue, downloadFileWithProgress } = files);
  const mode = String(config.mode || 'firebase');
  cloudMode = mode === 'cloud';
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



