# Bàn giao sau đồng bộ TV1 + TV2

## Trạng thái hiện tại

- TV1: FastAPI, Swagger, `/setup`, `/api/health`, `/api/project-status`, `/api/storage-check`, cấu hình Cloud/Emulator; **Storage check dùng chung Firebase Admin App** với `/api/auth/me`.
- TV2: Web SDK Email/Password, CRUD file, giới hạn file ở UI, token verification tại `/api/auth/me`; HTML trang `/`.
- TV3: sở hữu hoàn thiện Rules, integration tests, Spring Boot integration và hướng dẫn bảo mật.

## Một nguồn cấu hình duy nhất

Chỉ sửa `.env` của backend. `app/settings.py` đọc config; endpoint `/api/demo-config` phục vụ Web SDK. Không còn `frontend/firebase-config.js` dư thừa. Không đặt `serviceAccountKey.json` vào frontend hoặc GitHub.

Cloud Project ID: `student-file-hub-seminar-7a7f2` (xác minh tại Console). Cloud Bucket dự kiến: `student-file-hub-seminar-7a7f2.firebasestorage.app` (đối chiếu Console). Emulator Project ID: `demo-firebase-storage`.

## Bàn giao kỹ thuật cho TV3

- Đường dẫn file **đúng với frontend hiện tại**: `users/{uid}/{uuid}-{safeName}`, không có thư mục `files/` ở giữa.
- `frontend/storage.js` dùng Firebase Web SDK, chịu Security Rules.
- Backend Admin SDK chỉ đang kiểm tra bucket và xác minh ID Token; **chưa có Admin API đọc/xóa tệp người dùng**. Nếu thêm, bắt buộc kiểm tra quyền dựa trên UID đã xác minh ở backend.
- Giới hạn chính sách: JPEG/PNG/WebP/PDF, `0 < size <= 5 * 1024 * 1024`; Rules được kiểm thử trước bằng Emulator.
- Link `getDownloadURL` là URL chia sẻ có token, không phải bản đọc file có Auth mọi lần.
- Ưu tiên chạy `npm run test:emulators`, deploy Rules, test 2 tài khoản A/B thực tế, ghi kết quả vào `docs/verification.md`.

Xem [setup.md](setup.md) để cài đặt đầy đủ.
