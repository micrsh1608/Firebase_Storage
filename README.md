# FileSpace — Student File Hub

> **Phiên bản: 1.3.1** · FastAPI · Firebase Authentication · Cloud Storage · SQLite  
> Website quản lý tài liệu cá nhân và chia sẻ file theo tài khoản. Có thể chạy **hoàn toàn bằng Firebase Emulator** để học tập/demo, hoặc kết nối **Firebase Cloud thật** khi có quyền và cấu hình riêng.

## Mục lục

1. [Chức năng chính](#1-chức-năng-chính)
2. [Cấu trúc dự án](#2-cấu-trúc-dự-án)
3. [Yêu cầu môi trường](#3-yêu-cầu-môi-trường)
4. [Cách A — Clone và chạy bằng Firebase Emulator (khuyên dùng)](#4-cách-a--clone-và-chạy-bằng-firebase-emulator-khuyên-dùng)
5. [Cách B — Chạy với Firebase Cloud thật](#5-cách-b--chạy-với-firebase-cloud-thật)
6. [Hướng dẫn sử dụng nhanh](#6-hướng-dẫn-sử-dụng-nhanh)
7. [Các API và giới hạn](#7-các-api-và-giới-hạn)
8. [Chạy kiểm thử](#8-chạy-kiểm-thử)
9. [Lỗi thường gặp](#9-lỗi-thường-gặp)
10. [Lưu trữ dữ liệu và bảo mật](#10-lưu-trữ-dữ-liệu-và-bảo-mật)

---

## 1. Chức năng chính

- **Tài khoản:** đăng ký, đăng nhập, đăng xuất, quên mật khẩu; xác minh email và tự cập nhật trạng thái (Cloud gửi email thật, Emulator mô phỏng).
- **Tệp:** upload, tải xuống riêng tư, xem trước PDF/ảnh, đổi tên hiển thị và di chuyển tệp mà không đổi đường dẫn object trong Storage.
- **Thư mục:** tạo, đổi tên, di chuyển, xóa thư mục rỗng; điều hướng breadcrumb và thư mục nhiều cấp.
- **Tìm kiếm:** tìm tên tệp trong toàn bộ phạm vi được phép, lọc ảnh/PDF, sắp xếp và phân trang.
- **Chia sẻ:** chủ sở hữu chia sẻ cho email tài khoản đã đăng ký; người nhận chỉ có quyền xem và tải; chủ file có thể thu hồi quyền.
- **Thùng rác:** xóa mềm, khôi phục về trạng thái riêng tư và xóa vĩnh viễn.
- **Phân quyền:** trình duyệt sử dụng Firebase Authentication; các thao tác file/thư mục qua **FastAPI**, xác minh Firebase ID Token ở backend. Firebase Storage Rules mặc định chặn truy cập trực tiếp bằng Web SDK.

**Giới hạn hiện tại:** upload **từng file một**, tối đa **10 MiB/file**, **50 MiB** và **200 file/tài khoản**; tối đa **100 thư mục/tài khoản**, **10 cấp** và **20 người nhận/file**. Chưa hỗ trợ hàng đợi upload nhiều file, tự dọn thùng rác, quét virus hoặc triển khai production có nhiều server độc lập.

## 2. Cấu trúc dự án

```text
Firebase_Storage/                 # Thư mục gốc của repository sau khi clone
├── app/
│   ├── main.py                   # FastAPI, trang web, Swagger, Health Check
│   ├── settings.py               # Cấu hình Emulator / Cloud từ .env
│   ├── firebase_admin_client.py  # Khởi tạo Firebase Admin SDK
│   ├── file_service.py           # Nghiệp vụ file, quota, phân quyền
│   ├── file_state.py             # SQLite: thư mục, chia sẻ, thùng rác
│   └── routes/
│       ├── auth_demo.py          # Xác minh Firebase ID Token
│       └── files.py              # API file và thư mục
├── frontend/                     # HTML, CSS, JavaScript, PDF.js
├── tests/                        # Python, JavaScript, Emulator tests
├── docs/                         # Hướng dẫn và kết quả kiểm thử
├── scripts/                      # Công cụ phụ trợ
├── firebase.json                 # Cấu hình Auth/Storage Emulator
├── storage.rules                 # Chặn truy cập Storage trực tiếp từ client
├── package.json
├── package-lock.json
├── requirements.txt
├── requirements-dev.txt
├── .env.example                  # Mẫu cấu hình — được phép commit
├── .gitignore
└── README.md
```

> **Đúng thư mục rất quan trọng:** Mọi lệnh bên dưới phải chạy tại thư mục chứa **`app/`, `frontend/`, `firebase.json` và `requirements.txt`**. Nếu giải nén bản ZIP được chia sẻ thay vì clone Git, bản ZIP gốc có thể lồng thư mục `Firebase_Storage/firebase_storage/`; hãy mở thư mục **`firebase_storage` bên trong** bằng VS Code.

## 3. Yêu cầu môi trường

| Công cụ | Phiên bản / ghi chú |
|---|---|
| **Python** | 3.11 trở lên |
| **Node.js** | **24.12.0 trở lên** theo `package.json` của phiên bản này |
| **npm** | Đi kèm Node.js |
| **Java JDK** | Phiên bản tương thích với Firebase Emulator; nhóm ghi nhận chạy được với JDK 24 |
| **Git** | Để clone repository |
| **VS Code** | Khuyên dùng, không bắt buộc |
| **Trình duyệt** | Chrome/Edge; cần Internet để tải Firebase Web SDK từ CDN |

Kiểm tra trong Terminal:

```powershell
git --version
py --version
node --version
npm --version
java -version
```

Nếu dùng macOS/Linux, thay `py` bằng `python3` trong các lệnh tương ứng.

## 4. Cách A — Clone và chạy bằng Firebase Emulator (khuyên dùng)

**Ưu điểm:** không cần tài khoản Firebase thật, không cần Blaze, không cần Service Account JSON và không dùng bucket Cloud của nhóm.

### Bước 1. Clone source mới nhất

Mở Terminal tại thư mục muốn lưu dự án:

```powershell
git clone https://github.com/micrsh1608/Firebase_Storage.git
cd Firebase_Storage
```

Lưu ý: `git clone` mặc định lấy **nhánh mặc định của GitHub**. Người quản lý repository phải bảo đảm nhánh đó chứa **FileSpace v1.3.1** trước khi chia sẻ hướng dẫn. Nếu dùng bản ZIP và thư mục gốc khác, `cd` đến đúng nơi có `app/` và `requirements.txt`.

### Bước 2. Cài thư viện Python

**Windows (PowerShell):**

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

**macOS / Linux:**

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
```

### Bước 3. Cài thư viện Node.js / Firebase CLI

```powershell
npm ci
```

Lệnh này sử dụng `package-lock.json`, bao gồm Firebase CLI cần cho Emulator. **Không cần cài Firebase CLI toàn cục.** Nếu bạn chỉ muốn chạy demo, không cần chạy `npm run vendor:pdf` vì bộ PDF.js đã có trong `frontend/vendor/pdfjs/`.

### Bước 4. Tạo cấu hình Emulator

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Mở `.env`, giữ các giá trị đang có trong cấu hình mặc định:

```dotenv
DEMO_MODE=emulator
FIREBASE_PROJECT_ID=demo-firebase-storage
STORAGE_ENABLED=false
```

**Không** chuyển `DEMO_MODE` thành `cloud` nếu chưa có dự án Firebase và credential phù hợp. Nếu `.env` đã được cấu hình trước đó, không ghi đè mà hãy kiểm tra/sao lưu trước.

### Bước 5. Khởi động Firebase Emulator — Terminal 1

Trong VS Code: **Terminal → New Terminal**, ở thư mục gốc chạy:

```powershell
npm run emulators
```

Giữ Terminal này mở. Các dịch vụ mặc định:

| Dịch vụ | Địa chỉ |
|---|---|
| Firebase Authentication Emulator | `127.0.0.1:9099` |
| Firebase Storage Emulator | `127.0.0.1:9199` |
| Emulator UI | http://127.0.0.1:4000 |

### Bước 6. Khởi động FastAPI — Terminal 2

Mở **một Terminal khác** ở cùng thư mục dự án:

**Windows:**

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

**macOS / Linux:**

```bash
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

### Bước 7. Truy cập ứng dụng

| Địa chỉ | Mục đích |
|---|---|
| **http://127.0.0.1:8011/** | Website FileSpace |
| http://127.0.0.1:8011/setup | Trang kiểm tra cấu hình |
| http://127.0.0.1:8011/docs | Swagger REST API |
| http://127.0.0.1:8011/api/health | Kiểm tra FastAPI (`status: ok`) |
| http://127.0.0.1:8011/api/project-status | Xác nhận `mode: emulator` |
| http://127.0.0.1:4000/ | Firebase Emulator UI |

**Lưu ý:** Khi chạy Emulator, `GET /api/storage-check` trả về `status: emulator`, **không phải `status: ok` cho Cloud**. Điều này là bình thường.

### Bước 8. Tự kiểm tra nghiệp vụ

1. Mở website và **Đăng ký** tài khoản demo A; đăng nhập.
2. Tạo một thư mục, upload ảnh hoặc PDF hợp lệ (**không quá 10 MiB**).
3. Tìm kiếm tệp; thử đổi tên, di chuyển thư mục và xem trước.
4. Thử chuyển tệp vào thùng rác, khôi phục rồi xóa vĩnh viễn.
5. Đăng ký tài khoản B bằng email khác; dùng A chia sẻ một file cho B; đăng nhập B và xem mục **Được chia sẻ với tôi**.
6. Thử mục **Quên mật khẩu**. Trong Emulator, thao tác được mô phỏng; **không có email thật gửi đi**.

Dừng hai terminal bằng **Ctrl + C**. Mặc định dữ liệu tài khoản/file của Emulator có thể mất khi dừng; muốn giữ cần cấu hình import/export cho Emulator. Xem thêm mục lưu trữ dữ liệu ở cuối README.

---

## 5. Cách B — Chạy với Firebase Cloud thật

**Chỉ dùng khi bạn được cấp quyền vào một Firebase Project, có Cloud Storage Bucket và được phép sử dụng backend credentials.** Để chạy demo nhóm, nên ưu tiên Cách A.

### Bước 1. Chuẩn bị dịch vụ trên Firebase Console

Tại [Firebase Console](https://console.firebase.google.com/):

1. Chọn **đúng Project ID** (không chỉ nhìn tên hiển thị).
2. Vào **Authentication → Sign-in method**, bật **Email/Password**.
3. Tạo **Cloud Storage Bucket**. Dự án cần gói thanh toán/hạn mức phù hợp để dùng Cloud Storage.
4. Trong **Project settings → General → Your apps**, tạo/chọn Web App và lấy `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`.
5. Kiểm tra **Authentication → Settings → Authorized domains** nếu gặp lỗi miền localhost không được phép.
6. Giữ Storage Security Rules **từ chối client trực tiếp** theo `storage.rules` của repository. Phiên bản này upload/download qua FastAPI và Firebase Admin SDK, **không** upload bằng Firebase Web Storage SDK. Nếu cần deploy Rules, bảo đảm bạn có quyền và hiểu việc deploy sẽ thay Rules trên project đích.

### Bước 2. Điền `.env` cho Cloud

Từ `.env.example`, tạo `.env` và **thay thế** cấu hình Emulator bằng mẫu dưới đây (không để hai dòng `DEMO_MODE` cùng hoạt động):

```dotenv
DEMO_MODE=cloud
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
FIREBASE_WEB_API_KEY=YOUR_FIREBASE_WEB_API_KEY
FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_PROJECT_ID.firebaseapp.com
FIREBASE_STORAGE_BUCKET=YOUR_ACTUAL_BUCKET.firebasestorage.app
FIREBASE_APP_ID=YOUR_FIREBASE_WEB_APP_ID
STORAGE_ENABLED=true
GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json
```

Lấy chính xác `storageBucket` từ Firebase Console; **không** tự suy đoán đuôi bucket, không thêm `gs://`. Các trường Web Config được backend cấp cho trình duyệt qua `/api/demo-config`; **không cần sửa `frontend/firebase-client.js` để chèn config**.

### Bước 3. Cấp credentials cho FastAPI

**Máy local được phép truy cập Cloud:** tại **Project settings → Service accounts**, tải khóa Service Account mới nếu quy trình của nhóm cho phép; đặt **chỉ trên máy chạy backend**:

```text
Firebase_Storage/
└── secrets/
    └── serviceAccountKey.json    # KHÔNG COMMIT
```

Nếu chạy trên hạ tầng Google Cloud, nên dùng **Application Default Credentials / Workload Identity** khi được cấu hình phù hợp thay cho file JSON. Khi đó bỏ dòng `GOOGLE_APPLICATION_CREDENTIALS` và để runtime cấp credentials. Tài khoản dịch vụ phải có các quyền Storage/Firebase Auth phù hợp; **không công khai private key**.

### Bước 4. Chạy FastAPI

Đã cài Python dependencies theo Cách A, chạy:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Không cần chạy `npm run emulators` khi `DEMO_MODE=cloud`. Mở http://127.0.0.1:8011/ và kiểm tra:

- `GET /api/project-status`: `mode` phải là `cloud`, `storage_enabled` phải là `true`.
- `GET /api/storage-check`: khi Admin SDK kết nối đúng bucket, `status: ok` và trả về tên bucket.
- Đăng ký/đăng nhập, xác minh email thật, upload và download bằng tài khoản thử nghiệm.

> Cloud phát sinh chi phí theo mức dùng. **Không chia sẻ một Service Account JSON cho mọi người chỉ để clone chạy thử.** Firebase Web API key không phải private key; dữ liệu vẫn phải được bảo vệ bằng xác thực, phân quyền backend, IAM và Storage Rules.

---

## 6. Hướng dẫn sử dụng nhanh

| Nghiệp vụ | Cách thao tác |
|---|---|
| Quản lý tài liệu | Vào **Tài liệu của tôi** để xem file sở hữu |
| Thư mục | Chọn **Tạo thư mục**, mở thư mục, dùng **Đổi tên/Di chuyển** khi cần |
| Upload | Mở thư mục đích → **Tải tệp lên** → chọn **một** file hợp lệ |
| Download/Preview | Chọn file → **Tải xuống** hoặc **Xem trước** |
| Tìm kiếm | Nhập tên file; có thể lọc PDF/ảnh, sắp xếp và phân trang |
| Chia sẻ | Chủ file chọn **Chia sẻ**, nhập email người dùng đã đăng ký; người nhận vào **Được chia sẻ với tôi** |
| Thu hồi | Chủ file vào mục chia sẻ để thu hồi quyền đã cấp |
| Thùng rác | Chuyển file vào thùng rác → **Khôi phục** hoặc **Xóa vĩnh viễn** |
| Quên mật khẩu | Tại trang đăng nhập chọn **Quên mật khẩu?** |

**Ghi chú:** chia sẻ áp dụng **từng file**, không tự kế thừa từ thư mục. Thu hồi quyền ngăn truy cập mới nhưng không thể thu hồi bản sao người khác đã tải về.

## 7. Các API và giới hạn

Các API nghiệp vụ yêu cầu header `Authorization: Bearer <Firebase ID Token>`; các endpoint sức khỏe/cấu hình không cần token.

| API | Mục đích |
|---|---|
| `GET /api/health` | Trạng thái FastAPI |
| `GET /api/project-status` | Chế độ Emulator/Cloud và cấu hình |
| `GET /api/storage-check` | Kiểm tra Storage Cloud (ở Cloud mode) |
| `GET /api/auth/me` | Xác minh Firebase ID Token |
| `GET /api/files` | Danh sách file + tìm kiếm/lọc/sắp xếp/phân trang |
| `PUT /api/files?name=...` | Upload raw file body |
| `PATCH /api/files/{name}` | Đổi tên hiển thị / di chuyển file |
| `GET /api/files/{name}/content` | Tải file của mình |
| `GET /api/files/{name}/preview` | Xem trước file được phép |
| `GET /api/files/shared-with-me` | File được chia sẻ cho tôi |
| `POST /api/files/{name}/shares` | Chia sẻ cho tài khoản khác |
| `POST /api/files/{name}/trash` | Chuyển vào thùng rác |
| `POST /api/files/{name}/restore` | Khôi phục file |
| `DELETE /api/files/{name}` | Xóa vĩnh viễn file trong thùng rác |
| `GET /api/folders`, `POST /api/folders` | Liệt kê / tạo thư mục |
| `PATCH /api/folders/{id}`, `DELETE /api/folders/{id}` | Sửa / xóa thư mục rỗng |

API chi tiết, tham số, quyền và giới hạn: [docs/file-operations.md](docs/file-operations.md). Xem thử API trực tiếp bằng Swagger tại `/docs`. Không dán token của tài khoản thật vào tài liệu công khai.

## 8. Chạy kiểm thử

Nếu chưa cài gói Python dành cho phát triển:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

**Bài kiểm thử Python:**

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

**Unit tests JavaScript:**

```powershell
npm test
```

**Kiểm thử tích hợp bằng Firebase Emulator:**

1. Dừng `npm run emulators` đang chạy thủ công để tránh trùng cổng.
2. Chạy:

```powershell
npm run test:emulators
```

Lệnh này sẽ **tự khởi động/dừng Emulator** và chạy integration tests. Nếu cần, đặt `FILESPACE_TEST_PYTHON` trỏ tới Python trong `.venv`.

Theo [docs/verification.md](docs/verification.md) kèm bản source, nhóm ghi nhận **103 Python tests đạt**, cùng các bài kiểm thử JavaScript/Emulator bổ sung cho v1.3.1. Đây là kết quả ghi nhận trong tài liệu nhóm, không phải cam kết các test sẽ đạt trên mọi máy hoặc Firebase Cloud thật.

## 9. Lỗi thường gặp

| Triệu chứng | Nguyên nhân/cách kiểm tra |
|---|---|
| `py` hoặc `python` không nhận | Cài Python, bật PATH và khởi động lại Terminal |
| `ModuleNotFoundError: fastapi` / `firebase_admin` | Chưa cài dependencies bằng Python trong `.venv` |
| `npm ci` báo phiên bản Node không hợp lệ | Dùng **Node.js 24.12+** theo `package.json` |
| `java` không được tìm thấy | Cài JDK và cấu hình `PATH` / `JAVA_HOME` |
| Cổng `9099`, `9199` hoặc `4000` đang được dùng | Dừng Firebase Emulator cũ rồi chạy lại |
| Cổng `8011` đang được dùng | Dừng FastAPI cũ hoặc chọn cổng khác, đồng bộ địa chỉ trình duyệt |
| Trang `/` trắng / lỗi Firebase JS | Kiểm tra internet, Console trình duyệt và `GET /api/demo-config` |
| CSS/icon bị lỗi | Mở `/static/styles.css`, kiểm tra HTTP 200; tải lại bằng `Ctrl + Shift + R` |
| `/api/storage-check` trả `emulator` | Đúng khi chạy Emulator; không phải lỗi |
| `/api/storage-check` trả HTTP 503 trong Cloud | Kiểm tra bucket, credential, IAM và billing |
| `401` khi thao tác file | Chưa có token, token hết hạn hoặc backend chưa xác minh được phiên |
| `403` / `404` khi tải file chia sẻ | Thiếu quyền, file đã bị thu hồi/xóa hoặc không còn tồn tại |
| Upload bị từ chối | Kiểm tra loại file, giới hạn 10 MiB, tổng 50 MiB và 200 file/tài khoản |
| Emulator chạy lại nhưng file/tài khoản mất | Chưa cấu hình import/export dữ liệu Emulator (đây là mặc định) |
| `auth/unauthorized-domain` | Kiểm tra Authorized domains của Firebase Authentication |

## 10. Lưu trữ dữ liệu và bảo mật

### Những file không được đẩy lên GitHub

```text
.env
secrets/serviceAccountKey.json
secrets/*.json
.venv/
node_modules/
.data/
.runtime/
.git/            # Không đóng gói lại lịch sử Git trong ZIP bàn giao
```

Repository đã có `.gitignore`; trước khi commit hãy kiểm tra:

```powershell
git status
git ls-files .env secrets/serviceAccountKey.json
git diff --cached --name-only
```

Nếu `git ls-files` liệt kê private key, **không push**. Bỏ theo dõi file và xử lý lịch sử Git/thu hồi khóa nếu từng bị công khai; thêm `.gitignore` không xóa dữ liệu khỏi những commit cũ.

### Dữ liệu SQLite phải được giữ khi nâng cấp

- Dữ liệu nội dung file nằm trong Firebase Storage (Cloud hoặc Emulator).
- **Metadata về thư mục, tên hiển thị, chia sẻ và thùng rác nằm trong SQLite**, mặc định thư mục **`.data/`**, hoặc nơi được chọn qua `FILESPACE_DATA_DIR`.
- **Không xóa `.data/` trên hệ thống đang dùng thật:** cần sao lưu đồng bộ với bucket. Dữ liệu này **không phải cache**.
- Thư mục **`.runtime/`** dùng cho khóa thao tác trên filesystem; không cần commit. Các worker trên cùng máy cần chia sẻ dữ liệu/khóa theo thiết kế. Nhiều máy chủ riêng biệt cần giải pháp metadata và khóa phân tán trước khi vận hành production.
- Auth/Storage Emulator mặc định không giữ dữ liệu khi dừng; muốn giữ phải cấu hình import/export cho Emulator. Không nên coi `.data/` là bản sao đầy đủ của file Storage.

### Giới hạn phạm vi phiên bản

FileSpace v1.3.1 là bản phục vụ đồ án/seminar và thử nghiệm; **chưa mặc nhiên đáp ứng các yêu cầu của dịch vụ lưu trữ thương mại**. Các hạng mục như rate limiting, kiểm tra malware, upload nhiều file trong một hàng đợi, dọn thùng rác tự động, sao lưu và triển khai nhiều server cần phát triển thêm.

**Tài liệu tham khảo trong repository:**
- [Nghiệp vụ và API](docs/file-operations.md)
- [Kết quả kiểm thử](docs/verification.md)
- [Tài liệu setup](docs/setup.md) *(có nội dung lịch sử các bản TV1–TV2; ưu tiên README này cho v1.3.1)*
- [Ghi chú demo/seminar](docs/presentation-notes.md)

---

**Hướng dẫn nhanh nhất:** `git clone` → `py -m venv .venv` → `pip install -r requirements.txt` → `npm ci` → `Copy-Item .env.example .env` → chạy **`npm run emulators`** và **`uvicorn ... --port 8011`** ở hai Terminal → mở **http://127.0.0.1:8011/**.
