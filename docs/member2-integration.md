# Đồng bộ TV1 và TV2

Bản đã sửa đưa **toàn bộ cấu hình Firebase Web SDK và Admin SDK về một project** thông qua `app/settings.py` và `.env`. `GET /api/demo-config` cung cấp Web Config cho frontend. `GET /api/storage-check` và `GET /api/auth/me` dùng cùng Firebase Admin App, được khởi tạo chỉ khi cần. Không còn dùng Firebase Admin app mặc định thứ hai; không cần nhập lại Firebase Web Config vào file JS.

- Chạy Cloud: `DEMO_MODE=cloud` + đủ Web Config + `STORAGE_ENABLED=true` + backend credential riêng.
- Chạy Emulator: `DEMO_MODE=emulator` + `FIREBASE_PROJECT_ID=demo-firebase-storage` + emulator chạy ở 9099/9199.
- API Storage check ở Cloud: `ok` (có bucket), `disabled` (tắt cờ), 503 (lỗi); emulator trả `emulator`.
- `/api/auth/me`: cần ID Token đã xác minh; 401 nếu thiếu/sai token; 503 nếu không thể khởi tạo Admin SDK.
- Trang `/` thực hiện Auth và CRUD; `/setup` chứa dashboard của TV1.

Các giá trị bí mật được điền thủ công sau khi giải nén. Xem [setup.md](setup.md) và [team-handoff.md](team-handoff.md).
