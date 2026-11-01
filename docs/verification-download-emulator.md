# Kết quả kiểm thử bản sửa — 31/10/2026

Môi trường: Windows, Python 3.13.7, Firebase Admin 7.7.0, Node.js 24.4.1,
Firebase CLI 15.34.0, JDK 24.0.1 và Microsoft Edge headless.
Các phiên chạy thực tế chỉ kết nối project `demo-firebase-storage` trên local.

| Kiểm thử | Kết quả |
| --- | --- |
| Python / FastAPI: `python -m pytest -q` | 106 passed |
| JavaScript: `npm test` | 17 passed |
| Auth + Storage + Rules thật trên emulator: `npm run test:emulators` | 11 passed |
| `npm run dev:emulator` khi `.env` đang cấu hình cloud | API trả mode emulator, project/bucket demo |
| Runner xử lý Ctrl+C trên Windows | Dừng cây tiến trình API/CLI/Java, giải phóng các cổng local |
| Edge: tải từ danh sách | POST URL API, đúng tên `Bài kiểm thử.pdf`, đúng 598 byte, không tạo Blob URL |
| Edge: tải từ cửa sổ xem trước PDF | Đúng tên và nội dung, không tạo thêm Blob URL cho thao tác tải |
| Edge: file bị trash sau khi hiển thị trong danh sách | Server trả 404; lỗi hiện trên trang; trang không bị điều hướng |

Kiểm thử API bổ sung gồm thiếu/sai token, token quá dài, body quá lớn, token
trong query không được chấp nhận, người khác không thể tải, tải shared sau khi
thu hồi quyền bị từ chối, kiểm tra Origin và tên Unicode sau khi đổi tên.
Integration kiểm tra các route native với ID token thật của Auth Emulator và
đối chiếu byte tải từ Storage Emulator.

Cảnh báo deprecation Starlette/httpx và cảnh báo Java Unsafe từ rules runtime
không làm kiểm thử thất bại. Không dùng kết quả emulator để khẳng định đã
kiểm thử Firebase Cloud thật. Khuyến nghị Node.js 24.12+ theo `package.json`.

Bản phân phối chứa mã nguồn và tài nguyên frontend. `.env` đi kèm chỉ có cấu
hình demo emulator; không chứa service account, dữ liệu tài khoản/file, `.venv`,
`node_modules`, runtime/cache, file backup hoặc tiện ích ngrok.exe của bản gốc.
Cài lại dependencies theo README. Nếu cập nhật vào dự án cũ đang chạy cloud,
giữ lại `.env`, credential và `.data` riêng của bạn; nên giải nén bản này vào thư
mục mới để kiểm tra emulator trước.
