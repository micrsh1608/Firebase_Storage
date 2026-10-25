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
    'auth/invalid-email': 'Email chÆ°a Ä‘Ãºng Ä‘á»‹nh dáº¡ng.',
    'auth/missing-password': 'Vui lÃ²ng nháº­p máº­t kháº©u.',
    'auth/weak-password': 'Máº­t kháº©u cáº§n cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±.',
    'auth/email-already-in-use': 'Email nÃ y Ä‘Ã£ Ä‘Æ°á»£c Ä‘Äƒng kÃ½. HÃ£y chuyá»ƒn sang ÄÄƒng nháº­p.',
    'auth/invalid-credential': 'Email hoáº·c máº­t kháº©u chÆ°a Ä‘Ãºng.',
    'auth/user-not-found': 'Email hoáº·c máº­t kháº©u chÆ°a Ä‘Ãºng.',
    'auth/wrong-password': 'Email hoáº·c máº­t kháº©u chÆ°a Ä‘Ãºng.',
    'auth/too-many-requests': 'QuÃ¡ nhiá»u yÃªu cáº§u. Vui lÃ²ng Ä‘á»£i má»™t lÃ¡t rá»“i thá»­ láº¡i.',
    'auth/network-request-failed': 'KhÃ´ng káº¿t ná»‘i Ä‘Æ°á»£c dá»‹ch vá»¥ xÃ¡c thá»±c. Kiá»ƒm tra máº¡ng hoáº·c Auth Emulator.',
    'auth/operation-not-allowed': 'Email/Password chÆ°a Ä‘Æ°á»£c báº­t trong Firebase Authentication.',
    'auth/user-disabled': 'TÃ i khoáº£n Ä‘Ã£ bá»‹ vÃ´ hiá»‡u hÃ³a.',
    'storage/unauthenticated': 'PhiÃªn Ä‘Äƒng nháº­p Ä‘Ã£ háº¿t háº¡n. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i.',
    'storage/unauthorized': 'Báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p tÃ i liá»‡u nÃ y.',
    'storage/object-not-found': 'Tá»‡p khÃ´ng cÃ²n tá»“n táº¡i. HÃ£y lÃ m má»›i danh sÃ¡ch.',
    'storage/canceled': 'ÄÃ£ dá»«ng yÃªu cáº§u táº£i lÃªn. Kiá»ƒm tra danh sÃ¡ch vÃ¬ mÃ¡y chá»§ cÃ³ thá»ƒ Ä‘Ã£ lÆ°u tá»‡p.',
    'storage/network-error': 'Máº¥t káº¿t ná»‘i khi táº£i lÃªn. Kiá»ƒm tra danh sÃ¡ch trÆ°á»›c khi thá»­ láº¡i.',
    'storage/request-timeout': 'YÃªu cáº§u Ä‘Ã£ háº¿t thá»i gian. Kiá»ƒm tra danh sÃ¡ch trÆ°á»›c khi thá»­ láº¡i.',
    'storage/session-changed': 'PhiÃªn Ä‘Äƒng nháº­p Ä‘Ã£ thay Ä‘á»•i.',
    'storage/retry-limit-exceeded': 'Káº¿t ná»‘i táº£i tá»‡p Ä‘Ã£ háº¿t thá»i gian. Kiá»ƒm tra máº¡ng rá»“i thá»­ láº¡i.',
    'storage/quota-exceeded': 'Bucket Ä‘Ã£ vÆ°á»£t háº¡n má»©c. Kiá»ƒm tra cáº¥u hÃ¬nh vÃ  háº¡n má»©c Firebase.',
    'storage/unknown': 'Kho tÃ i liá»‡u chÆ°a xá»­ lÃ½ Ä‘Æ°á»£c yÃªu cáº§u. Kiá»ƒm tra káº¿t ná»‘i rá»“i thá»­ láº¡i.',
  };
  if (messages[code]) return messages[code];
  // The demo's own validation messages do not contain credentials or ID tokens.
  if (error instanceof Error && !code && error.message && error.message.length < 220 && !/token|bearer|eyJ/i.test(error.message)) return error.message;
  return 'Thao tÃ¡c chÆ°a hoÃ n táº¥t. Kiá»ƒm tra cáº¥u hÃ¬nh, káº¿t ná»‘i vÃ  thá»­ láº¡i.';
}

function sameUser(capturedGeneration, uid) {
  return generation === capturedGeneration && currentUser?.uid === uid;
}

function sameLibrary(capturedGeneration, uid, capturedView) {
  return sameUser(capturedGeneration, uid) && viewGeneration === capturedView;
}

function applyLibraryView() {
  const titles = { own: 'TÃ i liá»‡u cá»§a tÃ´i', shared: 'ÄÆ°á»£c chia sáº» vá»›i tÃ´i', trash: 'ThÃ¹ng rÃ¡c' };
  const descriptions = {
    own: 'Sáº¯p xáº¿p tÃ i liá»‡u trong thÆ° má»¥c vÃ  chia sáº» theo tÃ i khoáº£n. Tá»« khÃ³a tÃ¬m trong toÃ n bá»™ tÃ i liá»‡u cá»§a báº¡n.',
    shared: 'Báº¡n cÃ³ thá»ƒ xem trÆ°á»›c vÃ  táº£i xuá»‘ng. Quyá»n quáº£n lÃ½ tÃ i liá»‡u thuá»™c chá»§ sá»Ÿ há»¯u.',
    trash: 'TÃ i liá»‡u trong thÃ¹ng rÃ¡c váº«n chiáº¿m dung lÆ°á»£ng. KhÃ´i phá»¥c sáº½ giá»¯ tÃ i liá»‡u riÃªng tÆ° vÃ  khÃ´ng khÃ´i phá»¥c quyá»n chia sáº» cÅ©.',
  };
  el['recents-heading'].textContent = titles[libraryView];
  document.getElementById('file-library').dataset.view = libraryView;
  document.getElementById('file-library').setAttribute('aria-labelledby', 'library-' + libraryView);
  el['library-description'].textContent = descriptions[libraryView];
  el['folder-panel'].hidden = libraryView !== 'own';
  document.getElementById('file-date-heading').textContent = { own: 'Cáº­p nháº­t', shared: 'ÄÆ°á»£c chia sáº»', trash: 'ÄÃ£ xÃ³a' }[libraryView];
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
  showEmpty('Äang táº£i danh sÃ¡châ€¦', 'Vui lÃ²ng Ä‘á»£i trong giÃ¢y lÃ¡t.');
  el['file-search'].value = '';
  document.getElementById('topbar-search-input').value = '';
  el['file-filter'].value = 'all';
  el['file-sort'].value = 'newest';
  applyLibraryView();
  updateMetrics();
  updateControls();
  if (currentUser) void loadFilePage();
  else showEmpty('ÄÄƒng nháº­p Ä‘á»ƒ xem tÃ i liá»‡u', 'Sá»­ dá»¥ng tÃ i khoáº£n cá»§a báº¡n Ä‘á»ƒ má»Ÿ thÆ° viá»‡n.');
}

function formatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return 'â€”';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatDate(value) {
  if (!value) return 'ChÆ°a cÃ³ thá»i gian cáº­p nháº­t';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ChÆ°a cÃ³ thá»i gian cáº­p nháº­t';
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function updateVerification() {
  clearTimeout(verificationCooldownTimer);
  verificationCooldownTimer = null;
  const shown = Boolean(currentUser);
  const verified = verificationConfirmed;
  const remaining = Math.max(0, Math.ceil(((getVerificationRetryAt?.(currentUser?.uid) || 0) - Date.now()) / 1000));
  el['email-verification'].hidden = !shown;
  el['verification-status'].textContent = verified ? 'Email Ä‘Ã£ xÃ¡c minh'
    : currentUser?.emailVerified ? 'Äang Ä‘á»“ng bá»™ xÃ¡c minh email' : 'Äang chá» xÃ¡c minh email';
  el['verification-status'].classList.toggle('verified', verified);
  el['send-verification'].hidden = verified || Boolean(currentUser?.emailVerified);
  el['send-verification'].textContent = remaining ? `Gá»­i láº¡i email (${remaining}s)` : 'Gá»­i láº¡i email xÃ¡c minh';
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
  el['auth-submit'].replaceChildren(document.createTextNode(loggingIn ? 'ÄÄƒng nháº­p ' : 'Táº¡o tÃ i khoáº£n '));
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = 'â†’';
  el['auth-submit'].append(arrow);
  const heading = document.getElementById('auth-heading');
  if (!currentUser) heading.textContent = loggingIn ? 'ÄÄƒng nháº­p an toÃ n' : 'Táº¡o tÃ i khoáº£n má»›i';
  feedback(el['auth-feedback']);
}

function clearDownload() {
  downloadRequest += 1;
  feedback(el['download-feedback']);
}

function updateQuota(usage = null) {
  accountUsage = usage;
  el['quota-used'].textContent = usage ? formatSize(usage.usedBytes) : 'â€”';
  el['quota-limit'].textContent = usage ? formatSize(usage.maxBytes) : '50 MiB';
  el['quota-progress'].value = usage ? Math.min(100, usage.usedBytes / usage.maxBytes * 100) : 0;
  el['quota-message'].textContent = usage
    ? `CÃ²n ${formatSize(Math.max(0, usage.maxBytes - usage.usedBytes))} Â· Má»—i tá»‡p tá»‘i Ä‘a ${formatSize(usage.maxFileBytes)} Â· ${usage.fileCount ?? 0}/${usage.maxFiles ?? 200} tá»‡p Â· Bao gá»“m thÃ¹ng rÃ¡c.`
    : (currentUser ? 'Äang kiá»ƒm tra dung lÆ°á»£ng tÃ i khoáº£nâ€¦' : 'ÄÄƒng nháº­p Ä‘á»ƒ xem dung lÆ°á»£ng cá»§a báº¡n.');
  updateControls();
}

function clearSelectedFile() {
  selectedFile = null;
  el['file-input'].value = '';
  el['selected-file'].hidden = true;
  el['selected-name'].textContent = '';
  el['selected-meta'].textContent = '';
  el['upload-button'].textContent = 'Táº£i lÃªn ngay';
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
  el['account-email'].textContent = user?.email || 'TÃ i khoáº£n Firebase';
  // Update welcome name in topbar
  if (window.__setWelcomeName) {
    const name = user?.email ? user.email.split('@')[0] : 'báº¡n';
    window.__setWelcomeName(name);
  }
  el['account-uid'].textContent = user?.uid || '';
  el['user-prefix'].textContent = user ? `users/${user.uid}/` : 'ÄÄƒng nháº­p Ä‘á»ƒ xem Ä‘Æ°á»ng dáº«n';
  document.querySelector('.topbar-avatar')?.classList.toggle('signed-in', Boolean(user));
  document.getElementById('auth-heading').textContent = user ? 'TÃ i khoáº£n cá»§a báº¡n' : 'ÄÄƒng nháº­p an toÃ n';
  el['drop-title'].textContent = user ? 'Tháº£ tá»‡p vÃ o Ä‘Ã¢y' : 'ÄÄƒng nháº­p Ä‘á»ƒ táº£i tá»‡p lÃªn';
  el['auth-description'].textContent = user ? 'Báº¡n Ä‘ang sá»­ dá»¥ng kho tÃ i liá»‡u riÃªng cá»§a mÃ¬nh.' : 'DÃ¹ng email vÃ  máº­t kháº©u Ä‘á»ƒ má»Ÿ kho tÃ i liá»‡u cÃ¡ nhÃ¢n.';
  el['verify-button'].disabled = !user;
  updateControls();
  if (user) {
    el['file-results-label'].textContent = 'Äang láº¥y dá»¯ liá»‡uâ€¦';
    void loadFilePage();
    if (!verificationConfirmed) void verificationSync?.start(user);
  } else {
    el['file-results-label'].textContent = 'ÄÄƒng nháº­p Ä‘á»ƒ xem thÆ° viá»‡n';
    showEmpty('Báº¯t Ä‘áº§u thÆ° viá»‡n cá»§a báº¡n', 'ÄÄƒng nháº­p Ä‘á»ƒ xem vÃ  quáº£n lÃ½ tÃ i liá»‡u cÃ¡ nhÃ¢n.');
  }
}

function chooseFile(file) {
  if (!currentUser || uploadSession) return;
  feedback(el['upload-feedback']);
  if (!file) return;
  if (!ALLOWED_TYPES.has(file.type)) {
    clearSelectedFile();
    feedback(el['upload-feedback'], 'Chá»‰ nháº­n JPEG, PNG, WEBP hoáº·c PDF cÃ³ MIME type há»£p lá»‡.', 'error');
    return;
  }
  if (file.size === 0 || file.size > MAX_SIZE) {
    clearSelectedFile();
    feedback(el['upload-feedback'], file.size === 0 ? 'Tá»‡p rá»—ng chÆ°a thá»ƒ táº£i lÃªn. HÃ£y chá»n tá»‡p cÃ³ ná»™i dung.' : 'Tá»‡p vÆ°á»£t quÃ¡ 10 MiB. HÃ£y chá»n tá»‡p nhá» hÆ¡n.', 'error');
    return;
  }
  if (accountUsage && accountUsage.fileCount >= (accountUsage.maxFiles ?? 200)) {
    clearSelectedFile();
    feedback(el['upload-feedback'], 'ÄÃ£ Ä‘áº¡t giá»›i háº¡n sá»‘ tÃ i liá»‡u. XÃ³a vÄ©nh viá»…n tÃ i liá»‡u trong thÃ¹ng rÃ¡c Ä‘á»ƒ táº£i thÃªm.', 'error');
    return;
  }
  if (accountUsage && accountUsage.usedBytes + file.size > accountUsage.maxBytes) {
    clearSelectedFile();
    feedback(el['upload-feedback'], 'Dung lÆ°á»£ng khÃ´ng Ä‘á»§. XÃ³a vÄ©nh viá»…n tÃ i liá»‡u trong thÃ¹ng rÃ¡c hoáº·c chá»n tá»‡p nhá» hÆ¡n.', 'error');
    return;
  }
  selectedFile = file;
  el['selected-name'].textContent = file.name;
  el['selected-meta'].textContent = `${file.type} Â· ${formatSize(file.size)}`;
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
    for (const id of ['stat-total','stat-size','stat-docs','stat-images']) el[id].textContent = 'â€”';
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
    ownerName.textContent = libraryView === 'shared' ? file.ownerEmail || 'Chá»§ sá»Ÿ há»¯u' : 'TÃ´i';
    ownerWrap.append(ownerAvatar, ownerName);
    ownerCell.append(ownerWrap);

    // Access cell
    const accessCell = document.createElement('td');
    accessCell.className = 'td-access';
    const accessBadge = document.createElement('span');
    accessBadge.className = 'access-badge';
    accessBadge.textContent = libraryView === 'shared' ? 'Chá»‰ xem / táº£i' : libraryView === 'trash' ? 'ÄÃ£ ngá»«ng chia sáº»' : file.shareCount > 0 ? `ÄÃ£ chia sáº» (${file.shareCount})` : 'RiÃªng tÆ°';
    accessCell.append(accessBadge);

    // Action cell (hidden actions on hover or via context)
    const actionCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'file-actions';
    if (libraryView === 'trash') {
      actions.append(
        fileAction('KhÃ´i phá»¥c', (event) => void restoreOwnedFile(file, event.currentTarget, capturedGeneration, uid, capturedView), { iconName: 'ic-refresh' }),
        fileAction('XÃ³a vÄ©nh viá»…n', (event) => void deleteFile(file, event.currentTarget, capturedGeneration, uid, capturedView, true), { danger: true, iconName: 'ic-trash' }),
      );
    } else {
      actions.append(fileAction('Xem trÆ°á»›c', (event) => void openPreview(file, capturedGeneration, uid, capturedView), { iconName: 'ic-eye' }));
      actions.append(fileAction('Táº£i xuá»‘ng', (event) => void downloadOwnedFile(file, event.currentTarget, capturedGeneration, uid, capturedView), { iconName: 'ic-arrow' }));
      if (libraryView === 'own') {
        actions.append(
          fileAction('Äá»•i tÃªn', () => void openManager('rename-file', file), { iconName: 'ic-files' }),
          fileAction('Di chuyá»ƒn', () => void openManager('move-file', file), { iconName: 'ic-folder' }),
          fileAction('Chia sáº»', (event) => void openShareDialog(file, capturedGeneration, uid, capturedView), { iconName: 'ic-share' }),
          fileAction('VÃ o thÃ¹ng rÃ¡c', (event) => void deleteFile(file, event.currentTarget, capturedGeneration, uid, capturedView, false), { danger: true, iconName: 'ic-trash' }),
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
  el['file-results-label'].textContent = `${currentFiles.length} / ${serverTotal} tÃ i liá»‡u Â· Trang ${currentPage + 1}`;
  renderFiles(currentFiles, generation, currentUser.uid);
  updateSearchScope();
  if (currentFiles.length) {
    el['files-empty'].hidden = true;
    el['files-table-wrap'].hidden = false;
  } else if (el['file-search'].value.trim() || el['file-filter'].value !== 'all') {
    showEmpty('KhÃ´ng tÃ¬m tháº¥y tÃ i liá»‡u phÃ¹ há»£p', 'Thá»­ tá»« khÃ³a khÃ¡c hoáº·c bá» bá»™ lá»c. Káº¿t quáº£ Ä‘Æ°á»£c tÃ¬m trong toÃ n bá»™ danh sÃ¡ch Ä‘Ã£ chá»n.');
  } else {
    const emptyStates = {
      own: ['ThÆ° má»¥c chÆ°a cÃ³ tÃ i liá»‡u', 'Táº¡o thÆ° má»¥c hoáº·c táº£i tÃ i liá»‡u vÃ o thÆ° má»¥c Ä‘ang má»Ÿ.'],
      shared: ['ChÆ°a cÃ³ tÃ i liá»‡u Ä‘Æ°á»£c chia sáº»', 'TÃ i liá»‡u sáº½ xuáº¥t hiá»‡n khi chá»§ sá»Ÿ há»¯u chia sáº» cho email tÃ i khoáº£n cá»§a báº¡n.'],
      trash: ['ThÃ¹ng rÃ¡c Ä‘ang trá»‘ng', 'TÃ i liá»‡u báº¡n Ä‘Æ°a vÃ o thÃ¹ng rÃ¡c sáº½ xuáº¥t hiá»‡n á»Ÿ Ä‘Ã¢y.'],
    };
    showEmpty(...emptyStates[libraryView]);
  }
}

function updateSearchScope() {
  const searching = Boolean(el['file-search'].value.trim());
  el['search-scope'].textContent = libraryView === 'own'
    ? (searching ? 'TÃ¬m trong toÃ n bá»™ tÃ i liá»‡u cá»§a tÃ´i, bao gá»“m má»i thÆ° má»¥c.' : 'Äang xem tÃ i liá»‡u trá»±c tiáº¿p trong thÆ° má»¥c Ä‘ang má»Ÿ.')
    : libraryView === 'shared' ? 'TÃ¬m, lá»c vÃ  sáº¯p xáº¿p trÃªn toÃ n bá»™ tÃ i liá»‡u Ä‘Æ°á»£c chia sáº» vá»›i tÃ´i.' : 'TÃ¬m, lá»c vÃ  sáº¯p xáº¿p trÃªn toÃ n bá»™ thÃ¹ng rÃ¡c.';
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
  showEmpty('Äang tÃ¬m tÃ i liá»‡uâ€¦', 'Káº¿t quáº£ Ä‘ang Ä‘Æ°á»£c cáº­p nháº­t.');
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
  feedback(el['files-feedback'], 'Äang láº¥y danh sÃ¡ch tá»‡pâ€¦', 'neutral');
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
    el['page-label'].textContent = `Trang ${currentPage + 1} Â· ${files.length} tá»‡p`;
    el.pagination.hidden = files.length === 0 && currentPage === 0 && !nextPageToken;
    applyFileFilters();
    if (!files.length && currentPage > 0) showEmpty('Trang nÃ y chÆ°a cÃ³ tá»‡p', 'Quay vá» trang trÆ°á»›c hoáº·c lÃ m má»›i danh sÃ¡ch.');
    feedback(el['files-feedback']);
    return true;
  } catch (error) {
    if (!sameLibrary(capturedGeneration, uid, capturedView) || request !== listRequest) return false;
    nextPageToken = undefined;
    currentFiles = [];
    updateQuota();
    el['quota-message'].textContent = 'ChÆ°a xÃ¡c Ä‘á»‹nh Ä‘Æ°á»£c dung lÆ°á»£ng. HÃ£y lÃ m má»›i danh sÃ¡ch.';
    updateMetrics();
    el['file-results-label'].textContent = 'ChÆ°a thá»ƒ táº£i danh sÃ¡ch';
    el['files-body'].replaceChildren();
    el['file-count'].textContent = '0';
    showEmpty('ChÆ°a táº£i Ä‘Æ°á»£c danh sÃ¡ch', 'Kiá»ƒm tra káº¿t ná»‘i rá»“i chá»n LÃ m má»›i.');
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
  feedback(el['download-feedback'], `Äang táº£i ${file.name}â€¦`, 'neutral');
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
    feedback(el['download-feedback'], `ÄÃ£ gá»­i ${link.download} tá»›i trÃ¬nh duyá»‡t Ä‘á»ƒ lÆ°u.`);
  } catch (error) {
    if (sameLibrary(capturedGeneration, uid, capturedView) && request === downloadRequest) feedback(el['download-feedback'], friendlyError(error), 'error');
  } finally {
    if (sameUser(capturedGeneration, uid)) button.disabled = false;
  }
}

async function confirmDeletion(file, permanent) {
  const dialog = el['delete-dialog'];
  const description = permanent
    ? 'TÃ i liá»‡u sáº½ bá»‹ xÃ³a vÄ©nh viá»…n vÃ  khÃ´ng thá»ƒ khÃ´i phá»¥c.'
    : 'TÃ i liá»‡u váº«n chiáº¿m dung lÆ°á»£ng vÃ  cÃ³ thá»ƒ khÃ´i phá»¥c. Má»i quyá»n chia sáº» sáº½ bá»‹ thu há»“i.';
  if (typeof dialog.showModal !== 'function') return window.confirm(description);
  document.getElementById('delete-heading').textContent = permanent ? 'XÃ³a vÄ©nh viá»…n tÃ i liá»‡u?' : 'Chuyá»ƒn vÃ o thÃ¹ng rÃ¡c?';
  document.getElementById('delete-description').textContent = description;
  document.getElementById('confirm-delete').textContent = permanent ? 'XÃ³a vÄ©nh viá»…n' : 'Chuyá»ƒn vÃ o thÃ¹ng rÃ¡c';
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
      ? `ÄÃ£ xÃ³a vÄ©nh viá»…n ${displayFileName(file)}.`
      : `ÄÃ£ chuyá»ƒn ${displayFileName(file)} vÃ o thÃ¹ng rÃ¡c vÃ  thu há»“i quyá»n chia sáº».`);
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
    if (sameLibrary(capturedGeneration, uid, capturedView)) feedback(el['files-feedback'], `ÄÃ£ khÃ´i phá»¥c ${displayFileName(file)} vá» tÃ i liá»‡u riÃªng tÆ°. Quyá»n chia sáº» cÅ© khÃ´ng Ä‘Æ°á»£c khÃ´i phá»¥c.`);
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
    empty.textContent = 'ChÆ°a chia sáº» tÃ i liá»‡u nÃ y vá»›i ai.';
    fragment.append(empty);
  }
  for (const share of shares) {
    const item = document.createElement('li');
    item.className = 'share-recipient';
    const details = document.createElement('div');
    const email = document.createElement('strong');
    email.textContent = share.email;
    const permission = document.createElement('span');
    permission.textContent = 'Xem vÃ  táº£i xuá»‘ng';
    details.append(email, permission);
    const button = fileAction('Thu há»“i', () => void removeRecipient(share, context), { danger: true });
    button.setAttribute('aria-label', `Thu há»“i: ${share.email}`);
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
  feedback(el['share-feedback'], 'Äang láº¥y danh sÃ¡ch ngÆ°á»i nháº­nâ€¦', 'neutral');
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
    if (await loadShares(context)) feedback(el['share-feedback'], `ÄÃ£ thu há»“i quyá»n cá»§a ${share.email}.`);
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
  feedback(el['share-feedback'], 'Äang cáº¥p quyá»n xem vÃ  táº£i xuá»‘ngâ€¦', 'neutral');
  try {
    await grantShare(context.file.fullPath, email);
    if (!currentShareContext(context)) return;
    el['share-email'].value = '';
    if (await loadShares(context)) feedback(el['share-feedback'], `ÄÃ£ chia sáº» cho ${email}.`);
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
  el['toggle-password'].setAttribute('aria-label', showing ? 'áº¨n máº­t kháº©u' : 'Hiá»‡n máº­t kháº©u');
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
  feedback(el['auth-feedback'], action === 'login' ? 'Äang Ä‘Äƒng nháº­pâ€¦' : 'Äang táº¡o tÃ i khoáº£nâ€¦', 'neutral');
  updateControls();
  try {
    const result = await (action === 'login' ? login : register)(el.email.value.trim(), el.password.value);
    if (getCurrentUser() !== result.user) return;
    el.password.value = '';
    feedback(el['auth-feedback'], action === 'login' ? 'ÄÄƒng nháº­p thÃ nh cÃ´ng.' : 'ÄÃ£ táº¡o tÃ i khoáº£n vÃ  Ä‘Äƒng nháº­p.');
    if (result.verificationEmail && !verificationConfirmed) {
      feedback(el['verification-feedback'], result.verificationEmail.sent
        ? (result.verificationEmail.mode === 'emulator'
          ? 'ÄÃ£ táº¡o email xÃ¡c minh cá»¥c bá»™ trong Auth Emulator. Tráº¡ng thÃ¡i sáº½ tá»± cáº­p nháº­t sau khi báº¡n xÃ¡c minh.'
          : 'ÄÃ£ tá»± Ä‘á»™ng gá»­i email xÃ¡c minh. Má»Ÿ liÃªn káº¿t trong email; tráº¡ng thÃ¡i sáº½ tá»± cáº­p nháº­t.')
        : 'TÃ i khoáº£n Ä‘Ã£ táº¡o thÃ nh cÃ´ng nhÆ°ng chÆ°a gá»­i Ä‘Æ°á»£c email xÃ¡c minh. ' + friendlyError(result.verificationEmail.error),
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
    feedback(el['auth-feedback'], 'ÄÃ£ Ä‘Äƒng xuáº¥t.');
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
  feedback(el['verify-feedback'], 'Äang xÃ¡c thá»±c vá»›i APIâ€¦', 'neutral');
  try {
    const result = await verifyWithBackend();
    if (!sameUser(capturedGeneration, uid)) return;
    const returnedUID = result?.uid || result?.user?.uid;
    feedback(el['verify-feedback'], returnedUID ? `API Ä‘Ã£ xÃ¡c thá»±c UID: ${returnedUID}` : 'API Ä‘Ã£ xÃ¡c thá»±c ID token thÃ nh cÃ´ng.');
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
  feedback(el['verification-feedback'], 'Äang gá»­i email xÃ¡c minhâ€¦', 'neutral');
  try {
    const result = await sendVerification();
    if (sameUser(capturedGeneration, uid) && !verificationConfirmed) feedback(el['verification-feedback'],
      result.mode === 'emulator' ? 'ÄÃ£ táº¡o email xÃ¡c minh cá»¥c bá»™. Tráº¡ng thÃ¡i sáº½ tá»± cáº­p nháº­t.'
        : 'ÄÃ£ gá»­i láº¡i email. Má»Ÿ liÃªn káº¿t trong email; tráº¡ng thÃ¡i sáº½ tá»± cáº­p nháº­t.');
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
    feedback(el['upload-feedback'], 'Vui lÃ²ng chá»n má»™t tá»‡p cho má»—i lÆ°á»£t táº£i.', 'error');
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
  el['progress-label'].textContent = 'Äang táº£i lÃªnâ€¦ 0%';
  el['cancel-upload'].disabled = false;
  el['upload-button'].textContent = 'Äang táº£i lÃªnâ€¦';
  updateControls();
  try {
    const job = await uploadFile(file, (progress) => {
      if (!sameUser(capturedGeneration, uid) || uploadSession !== session) return;
      const percent = typeof progress === 'number' ? progress : ((progress?.bytesTransferred || 0) / (progress?.totalBytes || file.size)) * 100;
      const bounded = Math.max(0, Math.min(100, Math.round(percent)));
      el['progress-bar'].value = bounded;
      el['progress-label'].textContent = bounded === 100 ? 'ÄÃ£ gá»­i 100% Â· MÃ¡y chá»§ Ä‘ang kiá»ƒm tra vÃ  lÆ°u tá»‡pâ€¦' : `Äang táº£i lÃªnâ€¦ ${bounded}%`;
    }, uploadFolderId);
    session.task = job.task;
    if (session.cancelRequested || !sameUser(capturedGeneration, uid)) session.task?.cancel();
    await job.completed;
    if (!sameUser(capturedGeneration, uid) || uploadSession !== session) return;
    clearSelectedFile();
    feedback(el['upload-feedback'], `ÄÃ£ táº£i lÃªn ${file.name}.`);
    resetPagination();
    await loadFilePage();
  } catch (error) {
    if (sameUser(capturedGeneration, uid) && uploadSession === session) {
      // Retain selection for retry and reconcile an uncertain save after abort/network loss.
      el['upload-button'].textContent = 'Thá»­ táº£i láº¡i';
      feedback(el['upload-feedback'], friendlyError(error), error?.code === 'storage/canceled' ? 'neutral' : 'error');
      resetPagination();
      await loadFilePage();
    }
  } finally {
    if (uploadSession === session) {
      uploadSession = null;
      el['upload-progress'].hidden = true;
      if (!selectedFile) el['upload-button'].textContent = 'Táº£i lÃªn ngay';
      updateControls();
    }
  }
});

el['cancel-upload'].addEventListener('click', () => {
  if (!uploadSession) return;
  uploadSession.cancelRequested = true;
  uploadSession.task?.cancel();
  el['cancel-upload'].disabled = true;
  el['progress-label'].textContent = 'Äang há»§y táº£iâ€¦';
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
  for (const folder of [{ id: null, name: 'TÃ i liá»‡u cá»§a tÃ´i' }, ...folderBreadcrumbs]) {
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
  const destination = folderBreadcrumbs.at(-1)?.name || 'ThÆ° má»¥c gá»‘c';
  document.getElementById('upload-help').textContent = '10 MiB/tá»‡p Â· 50 MiB/tÃ i khoáº£n Â· Táº£i vÃ o: ' + (libraryView === 'own' ? destination : 'ThÆ° má»¥c gá»‘c') + '.';
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
    open.setAttribute('aria-label', 'Má»Ÿ thÆ° má»¥c: ' + folder.name);
    const actions = document.createElement('div');
    actions.className = 'folder-actions';
    for (const [kind, label] of [['rename-folder', 'Äá»•i tÃªn'], ['move-folder', 'Di chuyá»ƒn'], ['delete-folder', 'XÃ³a thÆ° má»¥c trá»‘ng']]) {
      const button = fileAction(label, () => {
        if (sameLibrary(capturedGeneration, uid, capturedView)) void openManager(kind, folder);
      }, { danger: kind === 'delete-folder' });
      button.setAttribute('aria-label', label + ' thÆ° má»¥c: ' + folder.name);
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
  for (const choice of [{ id: '', path: 'ThÆ° má»¥c gá»‘c' }, ...choices]) {
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
  const titles = { 'new-folder': 'Táº¡o thÆ° má»¥c', 'rename-folder': 'Äá»•i tÃªn thÆ° má»¥c', 'move-folder': 'Di chuyá»ƒn thÆ° má»¥c', 'delete-folder': 'XÃ³a thÆ° má»¥c trá»‘ng', 'rename-file': 'Äá»•i tÃªn tÃ i liá»‡u', 'move-file': 'Di chuyá»ƒn tÃ i liá»‡u' };
  const moving = kind.startsWith('move-');
  const naming = kind === 'new-folder' || kind.startsWith('rename-');
  el['manager-heading'].textContent = titles[kind];
  el['manager-description'].textContent = kind === 'delete-folder'
    ? 'Chá»‰ xÃ³a Ä‘Æ°á»£c thÆ° má»¥c khÃ´ng chá»©a thÆ° má»¥c con hay tÃ i liá»‡u, ká»ƒ cáº£ tÃ i liá»‡u trong thÃ¹ng rÃ¡c.'
    : kind === 'new-folder' ? 'ThÆ° má»¥c chá»‰ tá»• chá»©c tÃ i liá»‡u. Quyá»n chia sáº» Ä‘Æ°á»£c cáº¥p riÃªng cho tá»«ng tÃ i liá»‡u.'
    : 'Äá»•i tÃªn hoáº·c di chuyá»ƒn sáº½ giá»¯ nguyÃªn tÃ i liá»‡u vÃ  quyá»n chia sáº» Ä‘Ã£ cáº¥p.';
  el['manager-name-field'].hidden = !naming;
  el['manager-name'].required = naming;
  el['manager-name'].value = kind === 'new-folder' ? '' : item ? (kind.endsWith('-file') ? displayFileName(item) : item.name) : '';
  el['manager-target-field'].hidden = !moving;
  el['manager-target'].required = false;
  el['manager-submit'].textContent = kind === 'delete-folder' ? 'XÃ³a thÆ° má»¥c trá»‘ng' : kind === 'new-folder' ? 'Táº¡o thÆ° má»¥c' : 'LÆ°u thay Ä‘á»•i';
  el['manager-submit'].classList.toggle('button-danger', kind === 'delete-folder');
  el['manager-submit'].classList.toggle('button-primary', kind !== 'delete-folder');
  managerBusy = moving;
  updateManagerControls();
  el['manager-dialog'].showModal();
  if (moving) {
    feedback(el['manager-feedback'], 'Äang láº¥y danh sÃ¡ch thÆ° má»¥câ€¦', 'neutral');
    try {
      const data = await listFolders(null, true);
      if (!currentManagerContext(context)) return;
      fillFolderChoices(data.folders || [], context);
      feedback(el['manager-feedback']);
    } catch (error) {
      if (currentManagerContext(context)) {
        feedback(el['manager-feedback'], friendlyError(error) + ' ÄÃ³ng vÃ  má»Ÿ láº¡i Ä‘á»ƒ thá»­ láº¡i.', 'error');
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
  feedback(el['manager-feedback'], 'Äang lÆ°u thay Ä‘á»•iâ€¦', 'neutral');
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
    if (sameLibrary(context.generation, context.uid, context.viewGeneration)) feedback(el['files-feedback'], 'ÄÃ£ lÆ°u thay Ä‘á»•i.');
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
  feedback(el['preview-feedback'], 'Äang táº£i báº£n xem trÆ°á»›câ€¦', 'neutral');
  el['preview-dialog'].showModal();
  try {
    const blob = await previewFile(file.fullPath, context.ownerUid);
    if (!currentPreviewContext(context)) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('Äá»‹nh dáº¡ng nÃ y chÆ°a há»— trá»£ xem trÆ°á»›c.');
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
      content.alt = 'Xem trÆ°á»›c: ' + displayFileName(file);
      content.src = previewObjectURL;
    }
    if (content) { content.className = 'preview-document'; el['preview-content'].replaceChildren(content); }
    el['preview-download'].disabled = false;
    feedback(el['preview-feedback'], 'Báº£n xem trÆ°á»›c Ä‘Æ°á»£c táº£i báº±ng quyá»n truy cáº­p hiá»‡n táº¡i cá»§a báº¡n.');
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
  feedback(el['reset-feedback'], 'Äang xá»­ lÃ½ yÃªu cáº§uâ€¦', 'neutral');
  try {
    const result = await resetPassword(el['reset-email'].value.trim());
    if (generation !== capturedGeneration || request !== resetRequest || currentUser || !el['reset-dialog'].open) return;
    feedback(el['reset-feedback'], result.mode === 'emulator'
      ? 'Náº¿u email Ä‘Ã£ Ä‘Äƒng kÃ½, yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u Ä‘Ã£ Ä‘Æ°á»£c táº¡o. Khi cháº¡y cá»¥c bá»™, má»Ÿ Auth Emulator UI Ä‘á»ƒ kiá»ƒm tra email thá»­ nghiá»‡m.'
      : 'Náº¿u email Ä‘Ã£ Ä‘Äƒng kÃ½, báº¡n sáº½ nháº­n Ä‘Æ°á»£c hÆ°á»›ng dáº«n Ä‘áº·t láº¡i máº­t kháº©u. HÃ£y kiá»ƒm tra há»™p thÆ° vÃ  thÆ° rÃ¡c.');
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
      feedback(el['verification-feedback'], 'Email Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c minh. Quyá»n truy cáº­p Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t tá»± Ä‘á»™ng.');
    },
    onError: (error, user) => {
      if (currentUser === user && !verificationConfirmed) feedback(el['verification-feedback'],
        'ChÆ°a Ä‘á»“ng bá»™ Ä‘Æ°á»£c tráº¡ng thÃ¡i xÃ¡c minh. á»¨ng dá»¥ng sáº½ tá»± thá»­ láº¡i khi cÃ³ káº¿t ná»‘i.', 'neutral');
    },
  });
  ({ uploadFile, listFiles, downloadFile, previewFile, removeFile, trashFile, restoreFile, getShares, grantShare, revokeShare, listFolders, createFolder, updateFolder, deleteFolder, updateFile, createUploadQueue, downloadFileWithProgress } = files);
  const mode = String(config.mode || 'firebase');
  cloudMode = mode === 'cloud';
  el['environment-label'].textContent = /emulator/i.test(mode) ? 'Firebase Emulator Â· Cá»¥c bá»™' : 'Firebase Â· Trá»±c tiáº¿p';
  el['environment-dot'].classList.add('ready');
  el['project-id'].textContent = config.projectId || 'â€”';
  el['bucket-name'].textContent = config.bucket || 'â€”';
  initialized = true;
  switchAuthMode('login');
  updateControls();
  await watchAuth(onAuthChange);
} catch {
  initialized = false;
  updateControls();
  el['environment-label'].textContent = 'ChÆ°a káº¿t ná»‘i';
  el['environment-dot'].classList.add('error');
  el['boot-error'].textContent = 'ChÆ°a khá»Ÿi táº¡o Ä‘Æ°á»£c Firebase. Kiá»ƒm tra káº¿t ná»‘i internet Ä‘á»ƒ táº£i Web SDK, cáº¥u hÃ¬nh frontend vÃ  dá»‹ch vá»¥ emulator (náº¿u dÃ¹ng). Sau khi sá»­a, táº£i láº¡i trang. Xem README Ä‘á»ƒ cháº¡y demo báº±ng HTTP; khÃ´ng má»Ÿ trá»±c tiáº¿p báº±ng file://.';
  el['boot-error'].hidden = false;
}



