# Chạy Firebase Emulator trên máy local

## Cài đặt lần đầu (PowerShell)

Cài Python 3.11+, Node.js 24.12+ (theo `package.json`) và JDK 21+.
Kiểm tra `python --version`, `node --version`, `java -version`.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
npm run dev:emulator
```

Nếu `java -version` treo hoặc dùng sai bản Java, đặt `JAVA_HOME` về thư mục
JDK đã cài, ví dụ `$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'`, rồi chạy lại.
Runner thêm `JAVA_HOME/bin` vào PATH cho tiến trình emulator.

| Dịch vụ | Địa chỉ |
| --- | --- |
| Website FastAPI | http://127.0.0.1:8000 |
| Swagger | http://127.0.0.1:8000/docs |
| Emulator UI | http://127.0.0.1:4000 |
| Auth | 127.0.0.1:9099 |
| Storage | 127.0.0.1:9199 |

Project luôn là `demo-firebase-storage`, bucket
`demo-firebase-storage.firebasestorage.app`. Runner không sửa `.env`; entry point
`app.emulator:app` ghi đè cấu hình cloud trong tiến trình con và bỏ credential
cloud. Không cần Firebase login, project thật, service account hay Blaze.
Vẫn cần Internet trong lần cài dependencies/tải emulator, và khi trình duyệt
tải Firebase Web SDK từ gstatic (SDK của giao diện hiện vẫn dùng CDN).

Đăng ký một tài khoản mới trên website. Tài khoản/file cloud không được sao chép
vào emulator. Link xác minh email/đặt lại mật khẩu được hiển thị bởi Auth Emulator
trong terminal. Storage Rules vẫn deny-all cho client; FastAPI dùng Admin SDK
đến Storage Emulator sau khi xác thực người dùng.

## Chạy bằng hai terminal

```powershell
# Terminal 1
npm run emulators
# Terminal 2
npm run api:emulator
```

Hoặc chạy API trực tiếp bằng
`.\.venv\Scripts\python.exe -m uvicorn app.emulator:app --host 127.0.0.1 --port 8000`.
Chỉ bind emulator/API tại loopback. Dừng dịch vụ cũ nếu các cổng bị chiếm.

## Dữ liệu và kiểm thử

Metadata của chế độ local nằm riêng tại `.data/emulator`, khóa tại
`.runtime/emulator-file-locks`. Auth/Storage Emulator mặc định mất dữ liệu khi
dừng. Để giữ dữ liệu qua nhiều lần chạy, dùng terminal riêng:

```powershell
npx firebase emulators:start --only auth,storage --project demo-firebase-storage --import=.emulator-data --export-on-exit=.emulator-data
```

Lần đầu có thể bỏ `--import` nếu thư mục chưa tồn tại. Giữ cả `.data/emulator`
và dữ liệu export cùng nhau nếu muốn bảo toàn thư mục/chia sẻ/thùng rác.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
npm test
# Dừng emulator đang mở trước khi chạy lệnh này:
npm run test:emulators
```

Cloud mode vẫn dùng `python -m uvicorn app.main:app` với `.env` cloud trong
một terminal mới, không có biến môi trường emulator.

Tham khảo: [cấu hình Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure),
[Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth),
[Storage Emulator](https://firebase.google.com/docs/emulator-suite/connect_storage).
