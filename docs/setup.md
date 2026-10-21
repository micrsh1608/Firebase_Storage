# Setup Guide — Student File Hub (Firebase Blaze + Python FastAPI)

**Đối tượng:** Thành viên 1 và người nghe seminar muốn chạy thử backend trên **Windows 11 + VS Code**.  
**Firebase Project ID:** `student-file-hub-seminar-7a7f2`  
**Bucket đã kiểm tra trong seminar:** `student-file-hub-seminar-7a7f2.firebasestorage.app`  
**Mục tiêu:** Chạy FastAPI, kiểm tra cấu hình và xác nhận backend truy cập được Storage Bucket thật qua Swagger.

> Tài liệu này dựa trên source `app/main.py`, `app/firebase_client.py` của dự án hiện tại. Nó **không** tạo sẵn API upload/download/delete cho TV2 và cũng **không** xác thực Rules từ client cho TV3.

## Bước 0 — Chuẩn bị

Bạn cần:

- Python **3.11 trở lên** và VS Code.
- Quyền xem Firebase project trên [Firebase Console](https://console.firebase.google.com/).
- Project `student-file-hub-seminar-7a7f2` đã bật **Blaze** và đã tạo Storage Bucket.
- File Service Account JSON **thuộc chính project mới** và có quyền truy cập bucket (chỉ dành cho máy chạy backend tin cậy).
- Internet để cài dependencies và truy cập Firebase Cloud Storage.

Kiểm tra Python trong PowerShell:

```powershell
py --version
```

Nếu Windows không nhận `py`, hãy cài Python và Python Launcher, hoặc thử `python --version`.

## Bước 1 — Xác nhận Firebase Project và Storage Bucket

1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Chọn project **Student-File-Hub-Seminar**, xác nhận **Project ID** (không phải Project name) chính xác là `student-file-hub-seminar-7a7f2` ở **Project settings → General**.
3. Kiểm tra góc dưới trái hiển thị **Blaze**.
4. Vào **Storage → Files**, lấy **tên bucket thực tế**. Trong source hiện dùng `student-file-hub-seminar-7a7f2.firebasestorage.app`.
5. Vào **Authentication → Sign-in method**, bật **Email/Password** nếu nhóm dùng đăng nhập. Phần Backend Status API **không tự kiểm tra** trạng thái Authentication.
6. Vào **Storage → Rules**, giữ Rules theo nguyên tắc **deny-by-default** cho tới khi TV3 cấu hình phân quyền phù hợp. **Không chọn Test Mode để sử dụng lâu dài.**

> Nếu tên bucket thực tế khác tên nêu trên, điền **tên thực tế** trong `.env`. Không thêm tiền tố `gs://`.

## Bước 2 — Lấy Service Account cho Python Backend

1. Trong Firebase Console, mở **Project settings → Service accounts**.
2. Chọn mục **Firebase Admin SDK**, rồi **Generate new private key** (chỉ khi được phép và thực sự cần).
3. Trình duyệt tải xuống file JSON. **Không gửi file này cho giảng viên, ChatGPT, các bạn trong lớp, hoặc commit lên GitHub.**
4. Đổi tên thành `serviceAccountKey.json` và đặt trong thư mục `secrets/` ở gốc project.

Cấu trúc:

```text
firebase_member1_no_blaze/
├── app/
│   ├── main.py
│   └── firebase_client.py
├── secrets/
│   └── serviceAccountKey.json
├── .env
└── requirements.txt
```

Lưu ý: tài khoản trong JSON phải được cấp quyền phù hợp để kiểm tra bucket. Trong môi trường triển khai cloud thực tế, nên ưu tiên cơ chế xác thực của môi trường (Application Default Credentials/Workload Identity) thay vì tạo key dài hạn; mã nguồn mẫu hiện tại sử dụng file JSON để học tập trên Windows.

## Bước 3 — Mở đúng thư mục dự án

1. Giải nén source và mở **Visual Studio Code**.
2. Chọn **File → Open Folder** → thư mục `firebase_member1_no_blaze`.
3. Chọn **Terminal → New Terminal**.
4. Kiểm tra bạn đang ở **thư mục chứa `requirements.txt`**, không phải trong `app/` hoặc `frontend/`:

```powershell
Get-Location
Get-ChildItem requirements.txt
```

## Bước 4 — Tạo môi trường và cài thư viện

Chạy từng lệnh:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Các thư viện quan trọng gồm `fastapi`, `uvicorn`, `firebase-admin`, `python-dotenv`, `httpx`, `pytest`.

**Bạn không bắt buộc phải chạy** `Activate.ps1` — những lệnh trên đã chỉ định Python bên trong `.venv`, tránh lỗi PowerShell Execution Policy.

## Bước 5 — Tạo và cấu hình `.env`

Nếu chưa có `.env`, sao chép file mẫu:

```powershell
Copy-Item .env.example .env
```

**Không chạy lệnh trên nếu `.env` đã tồn tại và chứa cấu hình thật; hãy mở để kiểm tra thay vì tạo lại.**

Mở file `.env` trong VS Code, cập nhật đúng bốn biến:

```dotenv
FIREBASE_PROJECT_ID=student-file-hub-seminar-7a7f2
STORAGE_ENABLED=true
FIREBASE_STORAGE_BUCKET=student-file-hub-seminar-7a7f2.firebasestorage.app
GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json
```

Giải thích:

| Biến | Công dụng |
|---|---|
| `FIREBASE_PROJECT_ID` | Chọn project Firebase mới (không dùng ID `fir-web-codelab-37da8` của project cũ). |
| `STORAGE_ENABLED=true` | Cho phép API thực hiện kiểm tra Cloud Storage thật. |
| `FIREBASE_STORAGE_BUCKET` | Tên Storage Bucket, **không có `gs://`**. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Vị trí Service Account JSON trên máy backend; có thể là đường dẫn tương đối tính từ gốc project. |

> `.env` chỉ là cấu hình backend. **Firebase Web App Configuration** nằm riêng trong `frontend/firebase-config.js` và phải được lấy từ **chính project mới**. Đưa Web Config vào frontend **chưa đủ** để backend kết nối Firebase; backend cần Service Account như bước 2.

Lưu bằng `Ctrl + S`.

### Kiểm tra biến cấu hình trước khi khởi động

Chạy lệnh sau từ thư mục gốc:

```powershell
.\.venv\Scripts\python.exe -c "from app.firebase_client import storage_enabled, storage_configured; print('Storage enabled:', storage_enabled()); print('Storage configured:', storage_configured())"
```

Kết quả mong đợi:

```text
Storage enabled: True
Storage configured: True
```

Các giá trị này **chỉ xác nhận cấu hình**, chưa kiểm tra bucket thật.

## Bước 6 — Khởi chạy FastAPI

Nếu đang có server Uvicorn chạy, nhấn **Ctrl + C** để dừng trước.

Chạy:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Khi thành công, Terminal sẽ hiển thị tương tự:

```text
INFO: Uvicorn running on http://127.0.0.1:8000
INFO: Application startup complete.
```

**Giữ Terminal này mở**. Truy cập:

- Trang chủ: <http://127.0.0.1:8000/>
- Swagger UI: <http://127.0.0.1:8000/docs>

Nếu giao diện vẫn ghi "để sau Blaze", đó là **nội dung HTML cũ**, không quyết định trạng thái Storage; dùng API ở bước 7 để kiểm tra thực tế.

## Bước 7 — Kiểm tra Swagger từng API

Mở <http://127.0.0.1:8000/docs>. Với mỗi endpoint, bấm **Try it out → Execute**; quan sát **Server response → Code** và **Response body**.

### Test 7.1 — Health Check

**Endpoint:** `GET /api/health`.

Dự kiến **HTTP 200**:

```json
{
  "status": "ok",
  "service": "student-file-hub",
  "backend": "FastAPI"
}
```

Nó xác nhận **FastAPI phản hồi**, không xác nhận Firebase đã kết nối.

### Test 7.2 — Project Configuration

**Endpoint:** `GET /api/project-status`.

Dự kiến **HTTP 200**, trong JSON có các giá trị:

```json
{
  "firebase_project_configured": true,
  "firebase_project_id": "student-file-hub-seminar-7a7f2",
  "storage_enabled": true,
  "storage_configured": true,
  "auth_note": "Kiểm tra Email/Password đã bật trên Firebase Console; API này không xác minh cấu hình Auth."
}
```

Lưu ý: `firebase_project_configured: true` chỉ xác nhận đã điền Project ID, không truy vấn Firebase Console để chứng minh cấu hình là chính xác.

### Test 7.3 — Firebase Cloud Storage Connection

**Endpoint:** `GET /api/storage-check`.

Dự kiến **HTTP 200** với:

```json
{
  "status": "ok",
  "bucket": "student-file-hub-seminar-7a7f2.firebasestorage.app",
  "message": "Kết nối Cloud Storage thành công."
}
```

**Đây là checkpoint chính** xác nhận backend đã gọi Firebase Admin SDK và có thể kiểm tra sự tồn tại của Storage Bucket thật.

| Kết quả | Ý nghĩa |
|---|---|
| `200` + `status: "ok"` | Kiểm tra bucket thành công. |
| `200` + `status: "pending_blaze"` | `STORAGE_ENABLED=false`; API **không kết nối** Storage thật. |
| `503` | Đã thử kết nối nhưng thất bại; kiểm tra Terminal để tìm nguyên nhân (key/bucket/quyền/mạng). |

> Swagger có mục **Responses / Example Value** là ví dụ schema do Swagger hiển thị, không phải kết quả của request. Cần nhìn phần **Server response / Response body** sau khi bấm Execute.

## Bước 8 — Kiểm thử tự động bằng pytest

Mở Terminal mới ở thư mục gốc (để Terminal Uvicorn tiếp tục chạy) rồi nhập:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Với bản Starter, kết quả từng được kiểm tra là **4 passed**. Bốn test bao gồm trang chủ, `/api/health`, project status khi tắt Storage và trạng thái `pending_blaze` khi tắt Storage.

**Quan trọng:** Các test này dùng `monkeypatch` để đặt `STORAGE_ENABLED=false` cho test liên quan, nên **không chứng minh** Storage Bucket thật đang truy cập được. Phải kiểm tra riêng `GET /api/storage-check` ở bước 7.3.

## Bước 9 — Khắc phục lỗi thường gặp

| Triệu chứng | Nguyên nhân có thể | Cách xử lý |
|---|---|---|
| `py` không được nhận diện | Thiếu Python/Launcher | Cài Python 3.11+ hoặc thử `python -m venv .venv`. |
| `No module named fastapi` | Chưa cài requirements hoặc dùng nhầm Python | Cài lại bằng `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`. |
| `No module named app` | Mở Terminal sai thư mục | `cd` về thư mục gốc chứa `app/`. |
| Cổng `8000` bận | Có Uvicorn cũ | `Ctrl+C` ở Terminal cũ; hoặc dùng `--port 8001` và đổi URL kiểm tra. |
| `/api/storage-check` vẫn `pending_blaze` | `.env` đang `false`, server chưa restart, hoặc biến môi trường hệ thống ghi đè | Sửa `.env`, khởi động lại; kiểm tra lệnh ở Bước 5. |
| HTTP `503` + báo thiếu JSON | Không có Service Account JSON đúng đường dẫn | Đặt file ở `secrets/serviceAccountKey.json`, đúng project. |
| HTTP `503`, log có `403` | Service Account chưa đủ quyền | Kiểm tra IAM/permissions đối với bucket; không mở Rules công khai để sửa lỗi Admin SDK. |
| HTTP `503`, log có `404` | Sai tên bucket hoặc bucket chưa tạo | So sánh với Firebase Console → Storage → Files. |
| `/api/project-status` là `true` nhưng Storage thất bại | API cấu hình chỉ đọc biến, không kiểm tra dịch vụ | Kiểm tra `GET /api/storage-check` và log Terminal. |
| Web SDK upload bị `permission-denied` | Storage Rules Production Mode mặc định chặn Web SDK | TV3 thiết lập Rules theo UID; **không chuyển sang public `allow true`**. |

### Nếu `.env` đúng mà `STORAGE_ENABLED` vẫn là False

Mở Terminal mới:

```powershell
Get-ChildItem Env:STORAGE_ENABLED
```

Nếu PowerShell đang định nghĩa biến `STORAGE_ENABLED=false`, giá trị đó có thể được ưu tiên so với `.env` khi `load_dotenv()` chạy. Bạn có thể xóa **biến của phiên Terminal hiện tại** và chạy lại ứng dụng:

```powershell
Remove-Item Env:STORAGE_ENABLED
```

Lệnh `Remove-Item` có thể báo không tìm thấy biến nếu chưa từng được khai báo; trường hợp đó bỏ qua.

## Bước 10 — GitHub và bàn giao cho TV2/TV3

1. Đảm bảo `.gitignore` có ít nhất:

   ```gitignore
   .env
   .venv/
   secrets/*.json
   __pycache__/
   .pytest_cache/
   ```

2. Kiểm tra trước khi commit:

   ```powershell
   git status --short
   git check-ignore .env secrets/serviceAccountKey.json
   ```

3. **Không đưa Service Account JSON hoặc nội dung `.env` thật** vào repository, ảnh chụp, tài liệu lớp.
4. Bàn giao `frontend/firebase-config.js` của **project mới** cho TV2 (chỉ cấu hình Web App công khai), bucket path, file `.env.example` không có secrets, và tài liệu này.
5. TV3 cần kiểm tra Security Rules và authorization cho API Admin SDK. **Admin SDK không bị Security Rules phía client giới hạn**; các API file phía backend phải xác minh Firebase ID Token và quyền trước khi thao tác thay người dùng.

## Bước 11 — Kiểm soát chi phí Blaze

- Project hiện dùng gói **Blaze** (bao gồm giai đoạn dùng thử nếu còn hạn).
- Trong Google Cloud Billing, chọn đúng Billing Account/project và tạo **Budget Alert** (ví dụ 1 USD, các mốc 25%, 50%, 100%).
- **Budget Alert không phải giới hạn chi phí tuyệt đối**; theo dõi Usage/Billing, chỉ cho upload file nhỏ và giữ Rules an toàn.

## Kết quả bàn giao mong đợi

- [ ] Project ID trong `.env` khớp Firebase Console.
- [ ] Storage Bucket và Service Account thuộc cùng project mới.
- [ ] `GET /api/health` trả `status: ok`.
- [ ] `GET /api/project-status` hiển thị cấu hình `true` và Project ID mới.
- [ ] `GET /api/storage-check` trả `status: ok` với tên bucket thật.
- [ ] Swagger hoạt động và test tự động chạy được.
- [ ] Không có file bí mật trong GitHub.
- [ ] TV2 và TV3 đã nhận source và tài liệu setup.

---

**Tài liệu tham khảo chính thức:** [Firebase Admin SDK setup](https://firebase.google.com/docs/admin/setup) · [Cloud Storage for Firebase](https://firebase.google.com/docs/storage) · [FastAPI — First Steps](https://fastapi.tiangolo.com/tutorial/first-steps/) · [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)
