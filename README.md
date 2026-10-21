# Student File Hub — Firebase Storage Seminar

> **Thành viên 1 — Firebase Setup, Architecture & Python FastAPI**  
> Dự án seminar: **Firebase Storage — File Storage, Download URLs, Security Rules**  
> Firebase Project ID: **`student-file-hub-seminar-7a7f2`**

## 1. Giới thiệu

**Student File Hub** là ứng dụng minh họa cách kết nối dịch vụ lưu trữ file **Cloud Storage for Firebase** với backend **Python FastAPI**. Đây là bộ mã nguồn nền tảng do Thành viên 1 chuẩn bị để cả nhóm phát triển tiếp chức năng đăng nhập, tải file lên/xuống, xóa file và phân quyền.

Ứng dụng hiện có:

- Trang chủ demo tại `GET /`.
- API kiểm tra backend: `GET /api/health`.
- API xem trạng thái cấu hình: `GET /api/project-status`.
- API **kiểm tra truy cập Storage Bucket thật**: `GET /api/storage-check`.
- Swagger UI tại `GET /docs` và bài kiểm thử với `pytest`.

**Phạm vi hiện tại:** API `storage-check` chứng minh backend truy cập được bucket qua **Firebase Admin SDK**; mã nguồn Thành viên 1 **chưa triển khai** đăng nhập, upload/download/delete file hoặc kiểm thử Security Rules từ client. Các chức năng đó được tích hợp bởi Thành viên 2 và Thành viên 3.

## 2. Công nghệ

| Thành phần | Vai trò |
|---|---|
| Python 3.11+ | Ngôn ngữ backend |
| FastAPI, Uvicorn | REST API và máy chủ phát triển |
| Firebase Admin SDK for Python | Xác thực backend và truy cập Cloud Storage |
| Cloud Storage for Firebase | Lưu trữ file trên cloud |
| Firebase Authentication | Dịch vụ tài khoản; giao diện đăng nhập do TV2 triển khai |
| Firebase Storage Security Rules | Phân quyền thao tác Web/Mobile SDK; TV3 triển khai |
| python-dotenv | Đọc biến môi trường từ `.env` |
| pytest, httpx | Kiểm thử tự động |

## 3. Cấu trúc thư mục

```text
firebase_member1_no_blaze/
├── app/
│   ├── __init__.py
│   ├── main.py                   # FastAPI, HTTP routes
│   └── firebase_client.py        # Cấu hình và kiểm tra Storage qua Admin SDK
├── frontend/
│   ├── index.html                # Trang kiểm tra API
│   ├── firebase-config.example.js
│   └── firebase-config.js       # Tạo từ cấu hình Web App mới (nếu dùng)
├── docs/
│   ├── setup.md                  # Hướng dẫn chuẩn để cài, chạy và test
│   └── ...                       # Tài liệu seminar khác
├── secrets/
│   └── serviceAccountKey.json    # KHÔNG commit hoặc chia sẻ
├── tests/
│   └── test_main.py
├── .env                          # Cấu hình chạy local, KHÔNG commit
├── .env.example                  # File mẫu có thể chia sẻ
├── .gitignore
├── requirements.txt
└── README.md
```

> Tên thư mục hiện vẫn là `firebase_member1_no_blaze` vì kế thừa Starter Project; **không có nghĩa project hiện tại chưa dùng Blaze**. Đừng đổi tên tùy tiện nếu nhóm đang dùng cấu trúc này để tích hợp code.

## 4. Yêu cầu trước khi chạy

1. Máy Windows có **Python 3.11+**, VS Code và Internet.
2. Firebase project **`student-file-hub-seminar-7a7f2`** đã bật Blaze; có Storage Bucket **`student-file-hub-seminar-7a7f2.firebasestorage.app`** (phải đối chiếu tên thật trong Firebase Console → Storage → Files).
3. Backend có file Service Account **của chính project mới**, được cấp quyền truy cập bucket.
4. Tài khoản Firebase Authentication Email/Password đã được bật nếu nhóm cần thực hành phần đăng nhập sau này.

## 5. Chạy nhanh trên Windows PowerShell

Mở thư mục gốc dự án trong VS Code → **Terminal → New Terminal**.

```powershell
py --version
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

> Nếu đã có `.env` với cấu hình đúng, **không thực hiện lại** lệnh `Copy-Item` để tránh ghi đè ngoài ý muốn.

Đặt Service Account JSON trong `secrets/serviceAccountKey.json`. Mở `.env` và sửa như sau:

```dotenv
FIREBASE_PROJECT_ID=student-file-hub-seminar-7a7f2
STORAGE_ENABLED=true
FIREBASE_STORAGE_BUCKET=student-file-hub-seminar-7a7f2.firebasestorage.app
GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json
```

**Không đưa dấu `gs://` vào tên `FIREBASE_STORAGE_BUCKET`.** Lưu `.env`, sau đó chạy:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Mở:

- **Trang chủ:** http://127.0.0.1:8000/
- **Swagger UI:** http://127.0.0.1:8000/docs
- **Health:** http://127.0.0.1:8000/api/health
- **Project status:** http://127.0.0.1:8000/api/project-status
- **Storage check:** http://127.0.0.1:8000/api/storage-check

> `STORAGE_ENABLED=true` chỉ bật luồng kiểm tra Storage trong ứng dụng. Storage Bucket phải tồn tại trên Firebase từ trước; không phải chỉ sửa `.env` là tạo được bucket.

## 6. Kết quả API mong đợi

| Endpoint | HTTP | Nội dung cần kiểm tra |
|---|---:|---|
| `GET /api/health` | `200` | `status: "ok"` |
| `GET /api/project-status` | `200` | Đúng Project ID; `firebase_project_configured: true`, `storage_enabled: true`, `storage_configured: true` |
| `GET /api/storage-check` | `200` | `status: "ok"`, `bucket: "student-file-hub-seminar-7a7f2.firebasestorage.app"` |
| `GET /docs` | `200` | Hiển thị Swagger UI và các endpoint |

Ví dụ kết quả **sau khi kết nối Storage thật thành công**:

```json
{
  "status": "ok",
  "bucket": "student-file-hub-seminar-7a7f2.firebasestorage.app",
  "message": "Kết nối Cloud Storage thành công."
}
```

`/api/project-status` chỉ kiểm tra **giá trị cấu hình**, không xác minh Authentication. `/api/storage-check` mới thực hiện yêu cầu kiểm tra bucket thật khi Storage được bật.

## 7. Kiểm thử tự động

Trong Terminal thứ hai (hoặc dừng Uvicorn bằng `Ctrl+C`):

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Bộ test hiện có gồm 4 trường hợp: `health`, trang chủ, trạng thái cấu hình, và hành vi an toàn khi **tắt Storage**. **4 test pass không thay thế phép thử kết nối Blaze thật**; để xác nhận kết nối phải gọi `/api/storage-check` với `STORAGE_ENABLED=true`.

## 8. Kiến trúc và trách nhiệm

```text
Trình duyệt ──HTTP──> Python FastAPI ──Firebase Admin SDK──> Storage Bucket
     │
     └── Firebase Web SDK ──Authentication / Storage Rules──> Firebase services
         (TV2 + TV3 tích hợp sau)
```

- **TV1:** Firebase Project, bucket, cấu hình backend, FastAPI, kiểm tra kết nối, tài liệu setup, kiến trúc.
- **TV2:** Firebase Web SDK, đăng ký/đăng nhập, file upload, download URL, danh sách và xóa file.
- **TV3:** Storage Rules, kiểm thử phân quyền, bảo mật API và ví dụ tích hợp microservice.

**Quan trọng về bảo mật:** Firebase Admin SDK là SDK có đặc quyền phía server và **không bị Firebase Storage Security Rules kiểm soát như các client SDK**. Khi nhóm thêm API thao tác file bằng Admin SDK, backend phải **xác minh ID Token và tự kiểm tra quyền sở hữu file** trước khi đọc/ghi/xóa.

## 9. Bảo mật và chi phí

- **Tuyệt đối không commit** `secrets/serviceAccountKey.json` hoặc `.env` lên GitHub; kiểm tra `.gitignore` và `git status` trước khi push.
- Không nhúng service account vào `frontend/` hoặc slide.
- Cấu hình Firebase Web App (`apiKey`, `appId`, ...) **không phải** khóa Admin; tuy nhiên phải cấu hình Authentication/Rules đúng.
- Project ở gói **Blaze** có thể phát sinh chi phí. Theo dõi Storage usage và tạo **Billing Budget Alert**; cảnh báo ngân sách thông thường **không phải giới hạn chi tiêu cứng**.
- Storage Rules khởi tạo theo Production Mode có thể chặn Web SDK upload/download; TV3 cần thay bằng Rules an toàn và kiểm thử trước demo.

## 10. Tài liệu chi tiết

Đọc **[`docs/setup.md`](docs/setup.md)** để thực hiện từng bước: tạo/cấu hình Firebase, chuẩn bị Service Account, chạy FastAPI, dùng Swagger, chạy tests và xử lý lỗi thường gặp.
