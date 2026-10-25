# Changelog — đồng bộ TV1 và TV2

1. **Đồng bộ cấu hình:** `app/settings.py` là nguồn Web SDK Config duy nhất, lấy từ `.env`. `/api/demo-config` cung cấp dữ liệu công khai cho browser. Loại bỏ `frontend/firebase-config.js` và file ví dụ dư thừa.
2. **Dùng chung Admin app:** `app/main.py` tái sử dụng `get_firebase_app()` cho cả `/api/auth/me` lẫn `/api/storage-check`; `app/firebase_client.py` không tự khởi tạo Admin app mặc định thứ hai nữa.
3. **Trạng thái chính xác hơn:** `/api/storage-check` trả `ok` nếu Cloud Storage kiểm tra thành công, `disabled` nếu Cloud Admin bucket check tắt, `emulator` nếu chạy local, HTTP 503 khi lỗi.
4. **Không hardcode credentials:** `.env.example` là bản mẫu có placeholder, `.gitignore` bảo vệ `.env`, service account, dependencies. ZIP không có `.git`, `.venv`, node_modules, private key.
5. **Trang TV1 được cập nhật:** `/setup` không còn mô tả lỗi thời “chờ Blaze”; UI người dùng TV2 giữ nguyên tại `/`.
6. **Tài liệu:** Cập nhật `README.md`, `docs/setup.md`, handoff, verification. Bổ sung tests chứng minh Auth/Storage **dùng chung** Admin app (mock).
7. **Giữ nghiệp vụ TV2:** Không thay đổi đường dẫn `users/{uid}/{uuid}-{filename}`, quy tắc UI, các API và các chức năng CRUD file đã có.

## Sau khi nhận ZIP

- Copy `.env.example` thành `.env`, rồi **tự điền Firebase Web API key và App ID** của project đúng, cùng đường dẫn Admin credential riêng tư (xem `docs/setup.md`).
- Không đưa credential vào frontend và không push `.env` lên GitHub.
- Chạy `pytest`, `test:policy`, `test:emulators` và kiểm tra thực tế `/api/storage-check` trước demo.
