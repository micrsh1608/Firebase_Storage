# Student File Hub — Firebase Storage Seminar

Bản tích hợp **Thành viên 1 + Thành viên 2**: FastAPI và trang kiểm tra nền tảng, Firebase Authentication Email/Password, upload ảnh/PDF, danh sách phân trang, download URL và xóa tệp. Giao diện mới tại `/`; trang kiểm tra API của Thành viên 1 được giữ tại `/setup`.

Project cloud của nhóm: **`student-file-hub-seminar-7a7f2`**. Bucket được ghi trong tài liệu TV1: **`student-file-hub-seminar-7a7f2.firebasestorage.app`**; luôn đối chiếu tên thực tế trong Console. Chế độ local dùng project riêng **`demo-firebase-storage`** và không truy cập cloud.

## Chạy nhanh phần 2 bằng Emulator

Cần **Python 3.11+**, **Node.js 22+**, **JDK 21+** và Internet. Lần cài đầu cần tải dependencies/JAR; giao diện tải Firebase Web SDK từ CDN. Emulator không yêu cầu Firebase login, service-account key hay billing.

Mở PowerShell tại thư mục gốc `Firebase_Storage-member2`:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
```

**Không cần tạo `.env` cho local mới.** Mặc định là `DEMO_MODE=emulator`, project `demo-firebase-storage`, `STORAGE_ENABLED=false`. Nếu máy đã có `.env` hoặc biến môi trường của project cloud, sửa chúng cho khớp chế độ muốn chạy; không ghi đè cấu hình thật bằng lệnh copy.

Terminal 1, giữ chạy:

```powershell
npm run emulators
```

Chờ Auth và Storage sẵn sàng. Terminal 2, cùng thư mục:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Mở [Student File Hub](http://127.0.0.1:8000/), [trang setup TV1](http://127.0.0.1:8000/setup), [Swagger UI](http://127.0.0.1:8000/docs) hoặc [Emulator UI](http://127.0.0.1:4000). Không mở HTML bằng `file://`. Dùng cùng hostname `127.0.0.1` trong suốt buổi demo; emulator Auth ở cổng **9099**, Storage **9199**. Dữ liệu emulator mặc định mất khi dừng dịch vụ.

Nếu `java` chưa có trong PATH và máy có Android Studio với JDK ≥21:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
npm run emulators
```

## Demo phần 2 trong 3–4 phút

1. Tạo tài khoản local bằng email demo và mật khẩu ít nhất 6 ký tự; đăng ký thành công tự đăng nhập.
2. Upload PNG/JPEG/WebP hoặc PDF, **0 < size ≤5 MiB**; theo dõi tiến trình hoặc thử hủy.
3. Xem UID, metadata và đường dẫn `users/{uid}/{uuid}-{safeName}`; làm mới hoặc chuyển trang khi có hơn 20 tệp.
4. Chọn **Lấy URL**, mở/tải tệp, giải thích URL có download token là liên kết chia sẻ; logout không tự thu hồi URL.
5. Chọn **Xác thực với API**: `/api/auth/me` xác minh Firebase ID token rồi trả danh tính; không hiển thị token thô.
6. Xóa tệp, kiểm tra danh sách cập nhật, đăng xuất rồi đăng nhập lại.

## Những URL được giữ và bổ sung

| URL | Vai trò |
|---|---|
| `/` | Giao diện Authentication & File Operations của TV2 |
| `/setup` | Trang kiểm tra API nền tảng của TV1 |
| `/static/...` | HTML/CSS/JavaScript công khai; không chứa credential Admin |
| `/api/health` | Health check FastAPI; `status: "ok"` |
| `/api/project-status` | Trạng thái cấu hình; không chứng minh Auth hoặc cloud đã kết nối |
| `/api/storage-check` | Phép kiểm tra bucket qua Admin SDK khi bật `STORAGE_ENABLED=true` |
| `/api/demo-config` | Chỉ cấu hình Web SDK công khai và mode emulator/cloud |
| `/api/auth/me` | Nhận Bearer Firebase ID token, xác minh và trả UID/email |
| `/docs` | Swagger UI |

`STORAGE_ENABLED=false` tắt phép kiểm tra bucket của TV1; nó không tắt luồng upload bằng Web SDK của TV2. Trong local mặc định, `/api/storage-check` trả `pending_blaze`; nếu bật cờ trong mode emulator, endpoint trả `emulator` và vẫn không gọi bucket cloud. Các trạng thái này không đồng nghĩa demo client bị lỗi. Một kết quả `/api/health` hay `/api/project-status` thành công cũng không xác nhận cloud bucket truy cập được.

## Dùng project cloud của nhóm

Phần này giữ thông tin setup của TV1 và bổ sung Web config cần cho TV2. **Bản tích hợp chưa được kiểm thử trực tiếp trên project cloud**; xem [báo cáo kiểm chứng](docs/verification.md). TV1 đã ghi project dùng Blaze; xác nhận lại billing, bucket và quyền trong [Firebase Console](https://console.firebase.google.com/) trước khi diễn tập.

1. Chọn project `student-file-hub-seminar-7a7f2`; xác nhận bucket, Web app và bật **Authentication → Sign-in method → Email/Password**.
2. Tạo `.env` từ `.env.example` chỉ khi chưa có; nếu đã có thì sửa tại chỗ. Điền Web config từ **Project settings → General → Your apps**:

```dotenv
DEMO_MODE=cloud
FIREBASE_PROJECT_ID=student-file-hub-seminar-7a7f2
FIREBASE_WEB_API_KEY=YOUR_WEB_API_KEY
FIREBASE_AUTH_DOMAIN=student-file-hub-seminar-7a7f2.firebaseapp.com
FIREBASE_STORAGE_BUCKET=student-file-hub-seminar-7a7f2.firebasestorage.app
FIREBASE_APP_ID=YOUR_WEB_APP_ID
STORAGE_ENABLED=true
GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json
```

`YOUR_...` phải được thay bằng giá trị thật từ Console. Không thêm `gs://` vào tên bucket. Web config là định danh client công khai; service-account JSON là credential backend riêng tư. `/api/demo-config` cung cấp Web config cho UI mới, nên không cần chép thông tin vào `frontend/firebase-config.js` để chạy phần 2.

3. API auth mới `/api/auth/me` hỗ trợ Application Default Credentials/Workload Identity hoặc `GOOGLE_APPLICATION_CREDENTIALS` trỏ đến service-account JSON. Riêng `/api/storage-check` kế thừa TV1 vẫn yêu cầu **file service-account** qua `GOOGLE_APPLICATION_CREDENTIALS`; chỉ có ADC/Workload Identity chưa đủ cho phép kiểm tra này. Nếu chạy cả hai theo hướng dẫn Windows của TV1, đặt key đúng project tại `secrets/serviceAccountKey.json` và cấp quyền phù hợp. Chỉ máy/backend được phép đọc; không đưa key vào frontend, slide, Git hoặc gói chia sẻ lớp.
4. Xóa `FIREBASE_AUTH_EMULATOR_HOST` và `FIREBASE_STORAGE_EMULATOR_HOST` khỏi môi trường chạy cloud rồi khởi động lại backend. Cloud mode từ chối biến emulator để tránh nhận token local.
5. TV3 rà soát và thống nhất Storage Rules cho prefix UID trước khi áp dụng lên bucket của nhóm. Rules có trong repo là baseline local; chưa tự động được deploy lên cloud.
6. Chạy lại toàn bộ luồng client và `/api/auth/me`. Gọi [Storage check](http://127.0.0.1:8000/api/storage-check) với `STORAGE_ENABLED=true` để kiểm tra Admin SDK truy cập bucket; đây là phép thử riêng với Web SDK/Rules.

Kết quả cloud mong đợi của `/api/storage-check` là HTTP 200, `status: "ok"` và bucket đúng; lỗi quyền, credential, bucket hoặc dịch vụ có thể trả 503. Không suy ra kết nối cloud từ việc chỉ sửa `.env` hoặc từ test có mock. Tham khảo thêm [hướng dẫn setup TV1](docs/setup.md); các mô tả “chưa có CRUD” trong tài liệu TV1 phản ánh nền tảng trước khi ghép, còn cách chạy và route hiện tại theo README này và [ghi chú tích hợp](docs/member2-integration.md).

## Kiến trúc và trách nhiệm

```text
Browser ── Firebase Auth Web SDK ──> Authentication
   ├──── Storage Web SDK + ID token ──> Storage + Security Rules
   └──── Bearer ID token ──> FastAPI /api/auth/me ──> Admin Auth verifier

FastAPI /api/storage-check ──> Admin SDK ──> Bucket (luồng kiểm tra của TV1)
```

- **TV1:** project, bucket, FastAPI, Admin SDK, setup và kiến trúc; giữ các API kiểm tra nền tảng.
- **TV2:** đăng ký/đăng nhập/đăng xuất, upload, list, download URL, delete, UI và endpoint minh họa xác minh danh tính.
- **TV3:** rà soát Rules, kiểm thử phân quyền A/B, authorization backend, Best Practices & Limitations và ví dụ Spring Boot.

Admin SDK dùng quyền backend/IAM, không bị Storage Rules kiểm soát như Client SDK. `/api/auth/me` xác minh danh tính, chưa cấp quyền nghiệp vụ như nộp bài cho một lớp học. Phần 2 chưa có Spring Boot app; contract Bearer ID token và object path được bàn giao cho TV3.

## Kiểm thử và tài liệu tái sử dụng

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
npm run test:policy
```

Dừng emulator đang chạy trước khi gọi `npm run test:emulators`; lệnh này mở emulator riêng, chạy SDK/Rules tests rồi tắt. Các phép thử local không xác nhận billing, IAM, CORS hoặc retention của cloud. [verification.md](docs/verification.md) phân biệt kết quả gói độc lập ngày 19/10 với bản ghép hiện tại.

| Tài liệu | Dùng khi |
|---|---|
| [member2-integration.md](docs/member2-integration.md) | Xem những thay đổi khi ghép TV2 vào nền tảng TV1 |
| [file-operations.md](docs/file-operations.md) | Học/reuse Auth và thao tác tệp |
| [presentation-notes.md](docs/presentation-notes.md) | Chuẩn bị phần nói và demo của TV2 |
| [team-handoff.md](docs/team-handoff.md) | Thống nhất hợp đồng và việc còn lại của nhóm |
| [setup.md](docs/setup.md) | Setup project/bucket/Admin SDK do TV1 biên soạn |
| [verification.md](docs/verification.md) | Xem bằng chứng kiểm thử và giới hạn |

Các file TV1 và các tài liệu `01_...` đến `06_...` được giữ. Cấu trúc chính sau tích hợp gồm `app/main.py`, `app/firebase_client.py`, `app/firebase_admin_client.py`, `app/settings.py`, `app/routes/auth_demo.py`, `frontend/index.html`, `frontend/setup.html`, các module frontend TV2, `storage.rules`, `firebase.json`, `tests/` và cấu hình mẫu.

Không commit `.env`, service-account JSON hoặc dependencies sinh ra. Download URL có token cũng cần được chia sẻ có chủ đích. Cloud Storage có thể phát sinh chi phí; budget alert thông thường không phải giới hạn chi tiêu cứng. [Firebase Web config](https://firebase.google.com/docs/web/learn-more#config-object), [Cloud Storage billing FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
