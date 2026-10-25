# FileSpace — Student File Hub

**Phiên bản source:** v1.3.1  
**Backend:** Python FastAPI · **Đăng nhập:** Firebase Authentication · **Lưu file:** Firebase Cloud Storage thật · **Metadata nghiệp vụ:** SQLite  
**Mục tiêu của README:** Hướng dẫn clone và chạy FileSpace với **Firebase Cloud thật**, **không dùng Firebase Emulator**.

> **Phạm vi:** Các lệnh dưới đây chạy website FastAPI trên máy của bạn tại `http://127.0.0.1:8000` và kết nối qua Internet đến Firebase Authentication / Cloud Storage thật. Đây **chưa phải** hướng dẫn triển khai một website công khai trên Internet. Muốn phục vụ người dùng từ xa cần triển khai backend với HTTPS, cơ sở dữ liệu bền vững và cấu hình vận hành riêng.

## 1. FileSpace làm được gì?

- Đăng ký, đăng nhập, đăng xuất, xác minh email và khôi phục mật khẩu qua Firebase Authentication.
- Upload tài liệu qua FastAPI đến Firebase Cloud Storage; tải xuống và xem trước PDF/hình ảnh qua API có xác thực.
- Quản lý thư mục nhiều cấp; đổi tên, di chuyển, tìm kiếm, lọc, sắp xếp và phân trang file.
- Chia sẻ file theo tài khoản/email; người nhận được xem hoặc tải file còn quyền, không được tự sửa/xóa.
- Chuyển file vào thùng rác, khôi phục và xóa vĩnh viễn.
- Kiểm soát quyền và hạn mức ở backend: **10 MiB/file**, **50 MiB/tài khoản**, **200 file/tài khoản**. Thư mục tối đa **100/tài khoản**, sâu tối đa **10 cấp**; tối đa **20 người nhận/file**.

### Kiến trúc thực tế của source

```text
Browser / FileSpace UI
  ├── Firebase Web SDK ────────────> Firebase Authentication (Cloud thật)
  │         │ cấp Firebase ID Token
  │         └── Authorization: Bearer <ID_TOKEN>
  │
  └── HTTP API ────────────────────> Python FastAPI (chạy tại localhost:8000)
                                         ├── Firebase Admin SDK ──> Firebase Cloud Storage
                                         │    (nội dung PDF/ảnh, quyền server)
                                         └── SQLite (.data/) ──────> thư mục, tên hiển thị,
                                                                      chia sẻ, thùng rác
```

**Điểm cần hiểu:** File được lưu trên Firebase Cloud, nhưng **metadata SQLite vẫn nằm ở máy chạy FastAPI**. Hai người clone và chạy **hai backend riêng biệt**, dù kết nối cùng một Firebase Bucket, **không tự đồng bộ thư mục/chia sẻ/thùng rác qua SQLite**. Để chạy chung một hệ thống cho nhiều máy/người dùng, hãy triển khai **một backend dùng chung và một nơi lưu metadata bền vững dùng chung** (hoặc thiết kế chuyển metadata sang DB máy chủ). Không dùng các bản SQLite riêng biệt như một hệ thống cộng tác đa máy.

## 2. Yêu cầu trước khi chạy

Để chạy website với Firebase Cloud thật, cần:

1. **Python 3.11 trở lên** (khuyến nghị Python 3.11–3.13) và `pip`.
2. Git để clone source; trình duyệt Chrome/Edge/Firefox; kết nối Internet.
3. **Firebase Project thật** đã tạo Cloud Storage Bucket trên gói **Blaze** (có thể phát sinh chi phí).
4. Đã bật **Authentication → Sign-in method → Email/Password**.
5. Đã đăng ký **Firebase Web App** và có các giá trị `apiKey`, `authDomain`, `storageBucket`, `appId` từ chính project đó.
6. Backend có **Firebase Admin credentials** được cấp quyền phù hợp với Authentication và Storage; tuyệt đối không đưa private key vào GitHub.

**Không cần Node.js, Java hoặc chạy `npm run emulators` để sử dụng website ở Cloud mode.** Node.js/npm chỉ cần nếu bạn muốn chạy JavaScript tests, tái tạo PDF.js vendor hoặc triển khai Storage Rules bằng Firebase CLI. Tài nguyên PDF.js đã có trong `frontend/vendor/pdfjs/` của source này.

> **Quyền truy cập của người clone:** Clone GitHub chỉ lấy được **source**, không tự cấp quyền truy cập Firebase Cloud của nhóm. Mỗi người phải sử dụng một Firebase Project của họ, hoặc được quản trị viên cấp quyền/credentials an toàn cho project dùng chung. **Không chia sẻ `serviceAccountKey.json` qua repository/chat công khai.**

## 3. Chuẩn bị Firebase Cloud thật

Truy cập [Firebase Console](https://console.firebase.google.com/), chọn project của bạn rồi thực hiện:

1. **Storage → Files:** bảo đảm Bucket đã được tạo, ghi nhận **đúng tên bucket** (không thêm `gs://` vào `.env`). Firebase Storage yêu cầu project có cấu hình thanh toán Blaze.
2. **Authentication → Sign-in method:** bật **Email/Password**. Nếu dùng liên kết xác minh/khôi phục email trên domain riêng, kiểm tra **Authentication → Settings → Authorized domains** và cấu hình email template khi cần.
3. **Project settings → General → Your apps → Web App → SDK setup and configuration → Config:** lấy `apiKey`, `authDomain`, `storageBucket`, `appId` của **cùng project**.
4. **Project settings → Service accounts:** chuẩn bị Admin credentials cho backend. Khi chạy trên máy cá nhân, cách dễ nhất là **Generate new private key**, lưu JSON riêng trên máy. Cách phù hợp hơn khi triển khai lên Google Cloud là dùng Application Default Credentials/Workload Identity, không lưu JSON khóa dài hạn.
5. **Storage → Rules:** giữ quyền client **deny-all** theo `storage.rules` của source. Bản FileSpace này tải file qua **FastAPI + Admin SDK**, nên người dùng không cần truy cập Storage trực tiếp bằng Web SDK. Không đổi Rules thành `allow read, write: if true`.

**Project nhóm trước đây:** `student-file-hub-seminar-7a7f2`. Hãy đối chiếu tên thực tế trong Console; nếu dùng project khác, **thay toàn bộ** các giá trị tương ứng bên dưới.

Tài liệu Firebase chính thức: [Cloud Storage](https://firebase.google.com/docs/storage/web/start) · [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) · [Firebase Authentication](https://firebase.google.com/docs/auth/web/start).

## 4. Clone source về máy

Mở Terminal / PowerShell tại thư mục muốn lưu dự án:

```bash
git clone https://github.com/micrsh1608/Firebase_Storage.git
cd Firebase_Storage
```

> Repository phải được push **đúng bản source v1.3.1** lên nhánh mặc định. Nếu clone về thiếu `app/routes/files.py`, `app/file_service.py` hoặc `frontend/vendor/pdfjs/`, hãy kiểm tra nhánh và trao đổi với nhóm trước khi chạy. File ZIP của nhóm từng được đóng gói ở đường dẫn lồng `Firebase_Storage/firebase_storage/`; với ZIP tải thủ công, hãy **mở Terminal tại thư mục thực sự chứa `app/`, `frontend/`, `requirements.txt`**, không phải thư mục cha bên ngoài.

## 5. Cài đặt Python và dependencies

### Windows (PowerShell)

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Nếu `py` không tồn tại, thử `python -m venv .venv`.

### Linux / macOS (Terminal)

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt
```

Nếu Linux báo thiếu `ensurepip`/`venv`, hãy cài gói `python3-venv` tương ứng với bản Python/hệ điều hành trước khi tạo môi trường.

**Không sao chép `.venv` từ Windows sang Linux/macOS.** Mỗi máy cần tự tạo môi trường Python riêng.

## 6. Tạo và điền `.env` cho Cloud thật (bắt buộc)

Ở thư mục gốc có `.env.example`:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**Linux / macOS**

```bash
cp .env.example .env
```

Sau đó mở **`.env`** và **thay phần cấu hình chạy** bằng mẫu sau (đừng để các dòng cấu hình Emulator mặc định của `.env.example` có hiệu lực):

```dotenv
# BẮT BUỘC: chạy Firebase Cloud thật, KHÔNG chạy Emulator
DEMO_MODE=cloud
STORAGE_ENABLED=true

# Lấy từ Project settings > General và Storage > Files
FIREBASE_PROJECT_ID=student-file-hub-seminar-7a7f2
FIREBASE_WEB_API_KEY=YOUR_FIREBASE_WEB_API_KEY
FIREBASE_AUTH_DOMAIN=student-file-hub-seminar-7a7f2.firebaseapp.com
FIREBASE_STORAGE_BUCKET=student-file-hub-seminar-7a7f2.firebasestorage.app
FIREBASE_APP_ID=YOUR_FIREBASE_WEB_APP_ID

# Chỉ backend được dùng. Đây là đường dẫn đến file JSON BÍ MẬT trên máy.
GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json

# Tùy chọn: SQLite metadata, mặc định là thư mục .data của dự án
# FILESPACE_DATA_DIR=.data
```

**Bạn phải tự thay** `YOUR_FIREBASE_WEB_API_KEY` và `YOUR_FIREBASE_WEB_APP_ID` bằng giá trị Firebase Console; kiểm tra `PROJECT_ID`, `AUTH_DOMAIN` và `STORAGE_BUCKET` trùng cùng project. API Key của Firebase Web App là cấu hình phía client, **không phải** khóa Admin; private key JSON mới là bí mật phải bảo vệ.

### 6.1. Đặt Service Account JSON vào đúng chỗ

Tạo thư mục `secrets/` nếu chưa có, rồi đặt file khóa riêng của backend như sau:

```text
Firebase_Storage/
├── app/
├── frontend/
├── secrets/
│   └── serviceAccountKey.json   <-- CHỈ lưu trên máy/backend tin cậy
├── .env                         <-- không commit
└── requirements.txt
```

Tên JSON trong `.env` phải trùng đường dẫn thực tế. Source tại `app/firebase_admin_client.py` **tự xử lý đường dẫn tương đối từ thư mục gốc dự án** nên áp dụng chung cho Windows/Linux/macOS.

**Không upload `.env` hoặc `secrets/serviceAccountKey.json` lên GitHub.** Source đã có `.gitignore` cho các file đó, nhưng nếu file bí mật từng bị commit/chia sẻ công khai, hãy thu hồi khóa, cấp lại và kiểm tra lịch sử Git. Nếu dùng ADC trên môi trường Google Cloud có IAM phù hợp, có thể **bỏ** `GOOGLE_APPLICATION_CREDENTIALS` khỏi `.env` và để backend dùng Application Default Credentials.

### 6.2. Không để biến môi trường Emulator còn hiệu lực

Cloud mode sẽ từ chối khởi động nếu còn các biến:

`FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, `STORAGE_EMULATOR_HOST`.

Nếu Terminal từng chạy Emulator, hãy **mở Terminal mới sạch** hoặc xóa các biến này:

**PowerShell:**

```powershell
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST,Env:FIREBASE_STORAGE_EMULATOR_HOST,Env:STORAGE_EMULATOR_HOST -ErrorAction SilentlyContinue
```

**Linux/macOS:**

```bash
unset FIREBASE_AUTH_EMULATOR_HOST FIREBASE_STORAGE_EMULATOR_HOST STORAGE_EMULATOR_HOST
```

Lưu ý `python-dotenv` của source dùng `override=False`: **biến môi trường đã tồn tại trong hệ thống có thể ghi đè `.env`**. Nếu backend vẫn báo `mode=emulator`, kiểm tra biến `DEMO_MODE` ở Terminal/hệ điều hành rồi khởi động lại.

## 7. Khởi động FastAPI trên cổng 8000

**Chỉ cần MỘT Terminal**, không cần chạy Firebase Emulator.

### Windows

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Linux / macOS

```bash
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Khi chạy được sẽ xuất hiện thông báo tương tự:

```text
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

Mở các địa chỉ sau:

| Địa chỉ | Mục đích |
|---|---|
| http://127.0.0.1:8000/ | Giao diện FileSpace |
| http://127.0.0.1:8000/setup | Trang kiểm tra/cấu hình |
| http://127.0.0.1:8000/docs | Swagger API |
| http://127.0.0.1:8000/api/health | Kiểm tra FastAPI |
| http://127.0.0.1:8000/health | Kiểm tra **mode=cloud** |
| http://127.0.0.1:8000/api/project-status | Kiểm tra Project ID và bật Storage |
| http://127.0.0.1:8000/api/storage-check | Kiểm tra kết nối **Cloud Storage thật** |

> Nếu cổng `8000` đã bị chiếm, hãy **dừng FastAPI cũ** đang sử dụng cổng đó rồi chạy lại; không nên mở hai server trên cùng cổng. Nhấn **Ctrl + C** để dừng server.

## 8. Xác minh hệ thống đang dùng Cloud THẬT

Mở `http://127.0.0.1:8000/health`. Kết quả phải tương tự:

```json
{
  "status": "ok",
  "mode": "cloud"
}
```

Tiếp theo mở `http://127.0.0.1:8000/api/project-status`:

```json
{
  "firebase_project_configured": true,
  "firebase_project_id": "student-file-hub-seminar-7a7f2",
  "mode": "cloud",
  "storage_enabled": true,
  "storage_configured": true,
  "storage_emulator_enabled": false
}
```

Phản hồi thực tế có thêm trường `auth_note`.

**Bước kiểm chứng quan trọng nhất:** mở `http://127.0.0.1:8000/api/storage-check`:

```json
{
  "status": "ok",
  "bucket": "student-file-hub-seminar-7a7f2.firebasestorage.app",
  "message": "Kết nối Cloud Storage thành công."
}
```

Đây là **kết quả mong đợi**, không phải kết quả đã chạy xác minh từ máy người clone. Nếu endpoint trả HTTP 503, xem phần xử lý lỗi; nếu trả `disabled`, hãy đặt `STORAGE_ENABLED=true` rồi khởi động lại. **Chỉ `mode=cloud` chưa chứng minh kết nối Storage; phải kiểm tra được `status=ok`.**

### Kiểm tra các nghiệp vụ thật

1. Mở FileSpace, **đăng ký tài khoản thử** bằng email hợp lệ. Firebase Authentication Cloud tạo tài khoản thật; email xác minh hoặc reset password có thể gửi email thật.
2. Đăng nhập, mở chức năng **Xác thực với API**; kết quả hợp lệ đến từ `GET /api/auth/me` với Firebase ID Token.
3. Tạo thư mục → upload một PDF/ảnh nhỏ hợp lệ → kiểm tra file có xuất hiện trong **Firebase Console → Storage → Files** (prefix `users/{uid}/`).
4. Thử tải xuống/xem trước; đổi tên, di chuyển, chia sẻ cho tài khoản thử thứ hai đã xác minh email, rồi thử Trash/Restore.
5. Không thử bằng tài liệu nhạy cảm. Dọn dữ liệu thử sau khi hoàn thành; các thao tác Cloud có thể phát sinh chi phí.

**Lưu ý:** Truy cập `GET /api/auth/me` mà **không mang Bearer Token** trả HTTP 401 là hành vi **đúng** của API, không phải lỗi kết nối.

## 9. Giới hạn và lưu trữ dữ liệu trên bản này

| Hạng mục | Chính sách trong source |
|---|---|
| Định dạng upload | JPEG, PNG, WebP, PDF |
| Dung lượng file | Tối đa **10 MiB/file** |
| Tổng quota một tài khoản | **50 MiB**, tính cả file trong thùng rác |
| Số lượng file | **200 file/tài khoản** |
| Thư mục | **100 thư mục/tài khoản**, tối đa **10 cấp** |
| Chia sẻ | Tối đa **20 người nhận/file**; người nhận xem/tải, không được quản lý file |
| Danh sách | Tìm kiếm, lọc, sắp xếp rồi phân trang **20 file/trang** |

Trong phiên bản này, upload từ trình duyệt truyền qua **FastAPI/XHR** rồi backend ghi lên Firebase Storage. Chưa có upload nhiều file theo hàng đợi, chunked/resumable upload giữa các phiên hoặc HTTP Range download cho file lớn. Không nên giới thiệu những chức năng đó như đã hoàn thành.

**Dữ liệu bền vững:** Nội dung file ở Cloud Storage; tên hiển thị/thư mục/share/trash trong SQLite tại `.data/`. Hãy **sao lưu `.data/` cùng dữ liệu Cloud Storage**, không xóa `.data/` khi cập nhật code. Nếu thay backend hoặc đổi máy mà không di chuyển metadata SQLite, các nghiệp vụ thư mục/chia sẻ/thùng rác có thể không còn giống máy cũ. Cloud Storage không tự thay thế SQLite của ứng dụng.

## 10. Các lỗi phổ biến khi chạy Cloud

| Triệu chứng | Cách kiểm tra/khắc phục |
|---|---|
| `ValueError: Missing cloud configuration` | Chưa điền đầy đủ `FIREBASE_WEB_API_KEY`, `FIREBASE_APP_ID`, Project ID, Auth Domain hoặc Bucket trong `.env`. |
| `/health` trả `mode: emulator` | `.env` vẫn là `DEMO_MODE=emulator` hoặc bị biến hệ thống ghi đè; sửa thành `cloud`, mở Terminal sạch và khởi động lại. |
| Báo còn `FIREBASE_AUTH_EMULATOR_HOST` | Xóa các biến Emulator ở mục 6.2; không chạy các lệnh Emulator. |
| `/api/storage-check` trả `disabled` | `STORAGE_ENABLED=false`; sửa `true` rồi restart FastAPI. |
| `/api/storage-check` trả HTTP 503 | Kiểm tra bucket thực, Firebase Blaze, credentials JSON, IAM của service account và kết nối mạng. |
| `/api/auth/me` trả HTTP 401 | Chưa gửi Bearer ID Token, token hết hạn hoặc sai Firebase Project; đăng nhập lại rồi thử. |
| `/api/auth/me` trả HTTP 503 | Backend thiếu quyền/credentials hợp lệ hoặc Firebase Admin chưa kết nối được. |
| `auth/operation-not-allowed` | Chưa bật Email/Password trong Firebase Console. |
| Lỗi liên kết xác minh/reset email | Kiểm tra Authorized domains, Action URL/email template và giới hạn gửi email của Firebase Authentication. |
| `WinError 10048` hoặc `Address already in use` | Cổng `8000` đã có tiến trình khác. Dừng server cũ bằng Ctrl+C hoặc kiểm tra tiến trình chiếm cổng. |
| `ModuleNotFoundError` | Đã dùng sai Python/venv hoặc chưa cài `requirements.txt`; chạy đúng Python trong `.venv`. |
| File cũ/Rules khác trên Cloud | Bảo đảm mọi giá trị trong `.env` thuộc **cùng một Firebase Project** và kiểm tra Rules đang publish. |
| Thiếu hoặc lệch thư mục/chia sẻ giữa hai máy | Metadata SQLite `.data/` là cục bộ theo backend; cần một backend/DB chung, không chạy mỗi máy một bản DB riêng. |

### Vấn đề Storage Security Rules

Trong source, `storage.rules` mặc định:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Backend dùng **Admin SDK** để truy cập bucket, không bị các Rules dành cho client Web SDK chi phối. **Quyền người dùng phải được FastAPI xác minh** từ ID Token, không phải vì Rules tự phân quyền cho Admin SDK.

Nếu Rules thực tế trên Console khác file trong repo, quản trị viên nên đối chiếu và publish Rules phù hợp. Có thể cấu hình thủ công ở **Storage → Rules**, hoặc dùng Firebase CLI (yêu cầu npm, quyền triển khai và cẩn trọng vì sẽ thay Rules hiện có):

```bash
npm ci
npx firebase login
npx firebase deploy --only storage --project student-file-hub-seminar-7a7f2
```

Các lệnh trên **chỉ deploy Rules lên Cloud thật**, không khởi chạy Emulator. Kiểm tra đúng project trước khi thực hiện.

## 11. Chạy tests (tùy chọn, không bắt buộc để sử dụng Cloud)

**Python tests:**

**Windows**

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

**Linux/macOS**

```bash
./.venv/bin/python -m pytest -q
```

**JavaScript unit tests** (cần cài Node.js đúng phiên bản trong `package.json`, npm):

```bash
npm ci
npm test
```

Bộ test integration cũ của repo có thể dùng Emulator để kiểm tra mã nguồn, nhưng **không thuộc quy trình chạy Cloud của README này**. Các kết quả kiểm thử trước đó trong `docs/verification.md` chủ yếu là kiểm thử cục bộ/Emulator; **không thay cho bằng chứng chạy Cloud thật**.

## 12. Bảo mật, GitHub và vận hành

- **Không commit:** `.env`, `secrets/*.json`, `.data/`, `.runtime/`, `.venv/`, `node_modules/`, file khóa hoặc dữ liệu cá nhân.
- Trước khi push, kiểm tra `git status` và `git ls-files .env secrets/serviceAccountKey.json`; lệnh thứ hai không được liệt kê hai file nhạy cảm.
- Bảo vệ tài khoản Firebase, cấp quyền tối thiểu cho backend và tạo **Google Cloud Billing Budget Alert**. Budget Alert chỉ cảnh báo, **không tự động chặn chi phí**.
- Chỉ sử dụng `127.0.0.1:8000` cho phát triển cục bộ. Nếu mở website cho người dùng Internet, cần HTTPS, cơ chế triển khai backend phù hợp, xử lý khóa bí mật an toàn, cơ sở dữ liệu metadata dùng chung/bền vững, backup, logging và kiểm soát truy cập.
- Bản ZIP làm việc có thể chứa `.env`, SQLite hoặc Service Account JSON. **Không upload nguyên ZIP đó lên GitHub**. Nếu private key từng bị đăng công khai, hãy thu hồi/đổi khóa và kiểm tra lịch sử repository.

---

**Tóm tắt chạy nhanh:** Tạo Firebase Project Blaze + bật Email/Password + tạo Bucket → clone repo → tạo `.venv` và cài `requirements.txt` → tạo `.env` với `DEMO_MODE=cloud` và Firebase Web Config thật → cấu hình Admin credentials an toàn → chạy `uvicorn` trên cổng **8000** → kiểm tra `/health` (`cloud`) và `/api/storage-check` (`ok`) → đăng nhập và thử upload file thật.
