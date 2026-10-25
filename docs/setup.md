# Hướng dẫn setup Student File Hub — TV1 + TV2 (FastAPI + Firebase)

Tài liệu này áp dụng cho **bản source đồng bộ**, bao gồm quản lý file và Authentication của TV2, cùng Health/Storage check của TV1. **Không đưa credentials thật vào bản nộp**; người chạy tự thêm chúng vào máy riêng.

## 1. Chuẩn bị

- Windows 10/11, VS Code, Python 3.11 trở lên, trình duyệt Chrome/Edge, kết nối Internet.
- Dự án Firebase Blaze của nhóm: **`student-file-hub-seminar-7a7f2`**; Storage Bucket đã được xác minh trước đây: **`student-file-hub-seminar-7a7f2.firebasestorage.app`**. Vẫn kiểm tra lại trên Console.
- Để chạy **Emulator**: Node.js 22+, Java JDK tương thích và `npm install`.
- Chạy lệnh tại thư mục gốc có `app/`, `frontend/`, `requirements.txt`, `firebase.json`.

## 2. Chuẩn bị trên Firebase Console (Cloud)

**A — Chọn đúng project:** [Firebase Console](https://console.firebase.google.com/) → chọn project có **Project ID** `student-file-hub-seminar-7a7f2`. Tên hiển thị có thể giống một project khác; hãy dựa vào **Project ID**, không dựa vào nickname.

**B — Authentication:** Authentication → Sign-in method → Email/Password → **Enabled** → Save. Trong Authentication → Settings → Authorized domains, kiểm tra `localhost` nếu đăng nhập localhost gặp `auth/unauthorized-domain` (các project mới không nhất thiết cho sẵn).

**C — Storage:** Storage → Files → đọc **chính xác tên bucket**. Storage → Rules → dùng Rules đã qua kiểm thử của TV3; **Production mode mặc định `allow read, write: if false` sẽ từ chối upload qua Web SDK**. Không chuyển sang test mode công khai chỉ để sửa lỗi.

**D — Firebase Web App (phần cấu hình trình duyệt):** Project settings → General → Your apps → chọn `student-file-hub-web` → SDK setup and configuration → **Config**. Tại đây có các trường `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`. **KHÔNG cần copy vào file JS**. Hãy tự điền chúng vào `.env` ở bước 3. Web API key không phải khóa Admin và không được dùng để bảo vệ dữ liệu thay Security Rules.

**E — Backend service account:** Project settings → Service accounts → Firebase Admin SDK → Generate new private key (chỉ trên máy của người phụ trách backend, khi thật sự cần). Lưu file JSON vào `secrets/serviceAccountKey.json`. Đây là *khóa bí mật*, tuyệt đối không commit hoặc phân phát. Với môi trường Google Cloud có thể dùng Application Default Credentials / Workload Identity thay cho file JSON, khi được cấu hình và phân quyền đúng.

## 3. Khai báo `.env` — bạn tự điền các giá trị

Tại Terminal PowerShell của VS Code:

```powershell
Copy-Item .env.example .env
```

Mở `.env`, thay **toàn bộ nội dung mẫu emulator** bằng mẫu Cloud sau:

```dotenv
DEMO_MODE=cloud
FIREBASE_PROJECT_ID=student-file-hub-seminar-7a7f2
FIREBASE_WEB_API_KEY=YOUR_FIREBASE_WEB_API_KEY
FIREBASE_AUTH_DOMAIN=student-file-hub-seminar-7a7f2.firebaseapp.com
FIREBASE_STORAGE_BUCKET=student-file-hub-seminar-7a7f2.firebasestorage.app
FIREBASE_APP_ID=YOUR_FIREBASE_WEB_APP_ID
STORAGE_ENABLED=true
GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json
```

**Bạn tự thay** `YOUR_FIREBASE_WEB_API_KEY` bằng `apiKey` và `YOUR_FIREBASE_WEB_APP_ID` bằng `appId` từ Web App mới. Đối chiếu `authDomain` và `storageBucket` với Console; thay nếu khác. Project ID phải trùng trên tất cả thành phần. Không đưa dấu `gs://` vào giá trị bucket.

### Phân biệt các biến

| Biến | Ý nghĩa | Điền ở đâu |
|---|---|---|
| `DEMO_MODE=cloud` | Dùng Firebase Cloud thật | `.env` |
| `FIREBASE_PROJECT_ID` | Firebase Project ID (không phải Project name) | `.env` |
| `FIREBASE_WEB_API_KEY` | `apiKey` công khai của Web App | `.env`; tự điền |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` của Web App | `.env` |
| `FIREBASE_STORAGE_BUCKET` | Tên bucket Storage không có `gs://` | `.env` |
| `FIREBASE_APP_ID` | `appId` công khai của Web App | `.env`; tự điền |
| `STORAGE_ENABLED=true` | Bật **backend Admin bucket check**; không thay thế Storage Rules | `.env` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Đường dẫn file Service Account **chỉ cho Python server** | `.env` (tệp JSON bí mật nằm tại `secrets/`) |

**Không có** `frontend/firebase-config.js` cần sửa: `frontend/firebase-client.js` lấy các trường Web Config thống nhất từ `/api/demo-config` do `app/settings.py` cung cấp. Điều này tránh Backend/Frontend trỏ hai project khác nhau.

> Nếu dùng ADC thay cho file JSON, xóa dòng `GOOGLE_APPLICATION_CREDENTIALS` và cấu hình môi trường ADC đúng cách. Thiếu credentials backend: trang chủ và đăng nhập client vẫn có thể tải, nhưng `/api/storage-check` và `/api/auth/me` có thể trả HTTP 503.

## 4. Cài thư viện FastAPI và khởi động

```powershell
py --version
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Không bắt buộc kích hoạt `Activate.ps1`: gọi `python.exe` trong `.venv` trực tiếp sẽ tránh lỗi PowerShell Execution Policy. Dừng server bằng `Ctrl+C`. Sau khi sửa `.env`, **dừng server và khởi động lại hoàn toàn**.

## 5. Kiểm tra Swagger từng bước

Mở **http://127.0.0.1:8000/docs** → chọn endpoint → **Try it out** → **Execute**.

1. `GET /api/health`: HTTP 200, `{"status":"ok", ...}`.
2. `GET /api/project-status`: HTTP 200, `firebase_project_id` là `student-file-hub-seminar-7a7f2`, `mode` = `cloud`, `storage_enabled` = `true`, `storage_configured` = `true`.
3. `GET /api/demo-config`: HTTP 200, `firebaseConfig.projectId` phải trùng Project ID. Các trường Web Config là dữ liệu công khai; **không được xuất hiện `private_key`, `client_email` của Service Account hoặc credentials JSON**.
4. `GET /api/storage-check`: **HTTP 200, `status:"ok"`**, tên bucket đúng với Console. Chỉ khi đó mới xác minh được Admin Backend có thể truy cập bucket. `status:"disabled"` nghĩa là `STORAGE_ENABLED=false`; `status:"emulator"` nghĩa là đang chạy giả lập; HTTP 503 là lỗi cấu hình/credentials/IAM/bucket hoặc dịch vụ.
5. `GET /api/auth/me`: cần Firebase ID Token thực sự từ một tài khoản đã đăng nhập. Bấm **Authorize** trong Swagger, nhập ID Token của tài khoản demo mà bạn kiểm soát (không đăng token lên GitHub hoặc gửi cho người khác); endpoint phải trả UID/email đã xác minh. **Thiếu token sẽ trả 401**. Bạn cũng có thể bấm nút xác minh trong ứng dụng tại `/` thay vì chép token thủ công.

Vào **http://127.0.0.1:8000/**: tạo tài khoản demo hoặc đăng nhập, upload ảnh/PDF nhỏ, xem danh sách, lấy URL và xóa file. Nếu upload `storage/unauthorized` thì kiểm tra việc **publish Rules của TV3** và thư mục `users/{uid}/...`. Nếu upload quá lớn/định dạng không hợp lệ, UI phải chặn. URL tải có token có thể được mở sau khi logout: không coi đây là URL bảo mật riêng theo UID.

Trang chỉ kiểm tra API của TV1 nằm tại **http://127.0.0.1:8000/setup**.

## 6. Chạy bằng Firebase Emulator (không cần Blaze)

Tạo `.env` dạng:

```dotenv
DEMO_MODE=emulator
FIREBASE_PROJECT_ID=demo-firebase-storage
STORAGE_ENABLED=false
```

Xóa khỏi Terminal mọi biến `FIREBASE_AUTH_EMULATOR_HOST` / `FIREBASE_STORAGE_EMULATOR_HOST` được thiết lập từ phiên chạy khác nếu chuyển sang cloud.

```powershell
npm install
npm run emulators
```

Mở **Terminal thứ hai** (emulator vẫn chạy):

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Truy cập `/` và `/docs`. Chế độ emulator trả `status:"emulator"` ở `/api/storage-check`, không kiểm tra bucket Cloud. Dữ liệu emulator mặc định không được giữ sau khi đóng nếu không import/export.

## 7. Chạy unit và integration tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm run test:policy
npm run test:emulators
```

`pytest` chủ yếu kiểm tra API/logic/mock, không tự xác minh Firebase Cloud. `test:emulators` sử dụng Auth và Storage Emulator để kiểm thử Rules thực tế. **Cần chạy kiểm thử thật trên máy có dependencies đầy đủ**, không suy ra trạng thái Cloud từ test mock.

## 8. Lỗi thường gặp

| Hiện tượng | Hướng kiểm tra |
|---|---|
| `ValueError: Missing cloud configuration` | Thiếu một trong các biến `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`, `FIREBASE_STORAGE_BUCKET` hoặc placeholder chưa thay |
| `Local demo uses ...` | Đặt `DEMO_MODE=cloud` nếu dùng Project ID thật; không trộn project Cloud trong mode emulator |
| `/api/storage-check` là `emulator` | `.env` còn `DEMO_MODE=emulator`; dừng và khởi động lại |
| `/api/storage-check` là `disabled` | `.env` chưa bật `STORAGE_ENABLED=true`; restart |
| `/api/storage-check` HTTP 503 | Kiểm tra bucket, quyền IAM, service-account JSON, credentials path; xem log server không công khai |
| `/api/auth/me` HTTP 401 | Thiếu/sai token hoặc phiên đăng nhập hết hạn |
| `/api/auth/me` HTTP 503 | Admin credentials hoặc Firebase xác minh bị lỗi |
| `storage/unauthorized` | Rules chưa publish, user chưa login, sai UID/path, type/size không đạt |
| `auth/unauthorized-domain` | Thêm localhost vào Auth → Settings → Authorized domains nếu thiếu |
| `No module named app` | Chạy lệnh từ thư mục gốc project |
| `Port 8000 already in use` | Dừng server cũ bằng Ctrl+C hoặc dùng `--port 8001` |
| Thay `.env` không có tác dụng | Khởi động lại Python; xem môi trường ngoài có override `.env` không (`Get-ChildItem Env:DEMO_MODE`) |

## 9. Publish Rules sau khi TV3 kiểm thử

Chỉ deploy khi đã chạy emulator và kiểm tra Rules an toàn:

```powershell
npx firebase login
npx firebase deploy --only storage --project student-file-hub-seminar-7a7f2
```

Sau đó dùng ít nhất hai tài khoản demo A/B xác nhận A không thể truy cập file của B qua SDK. Quyền Admin SDK phía server **không chịu Storage Rules**, nên các API backend đọc file sau này cần kiểm soát UID độc lập.

## 10. Quy tắc bảo mật & bàn giao

- Giữ `.env` và `secrets/serviceAccountKey.json` trên máy người quản trị; `.gitignore` chỉ bảo vệ các file *chưa được commit*. Nếu khóa từng lên GitHub, **thu hồi/rotate khóa**; tránh chỉ xóa file ở HEAD.
- **Không** chia sẻ token, private key hoặc dữ liệu thật của sinh viên để demo.
- Khi chia sẻ ZIP cho lớp, chỉ đóng gói source/docs, không gồm `.git`, `.venv`, `node_modules`, khóa Admin hay `.env`.
- Chọn giới hạn file (UI ≤5 MiB và Security Rules cùng mức), đặt billing alerts (không tự ngừng hóa đơn), đóng tài khoản demo sau buổi học nếu cần.
