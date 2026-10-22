# Ghi chú tích hợp Thành viên 2

Bản ghép ngày **22/10/2026** vào nền tảng **Student File Hub** của TV1. Mục tiêu là dùng chung một FastAPI app cho setup và thao tác người dùng, giữ các API kiểm tra đã có, đồng thời bổ sung Authentication & File Operations.

## Hành vi sau khi ghép

| Thành phần | Trước khi ghép TV2 | Sau khi ghép |
|---|---|---|
| Trang `/` | Dashboard kiểm tra API của TV1 | Student File Hub: đăng ký, đăng nhập và thao tác tệp |
| Trang setup | Dashboard ở `/` | Dashboard gốc được giữ trong `frontend/setup.html`, phục vụ tại `/setup` |
| `/static` | Phục vụ frontend TV1 | Giữ mount; thêm các module và CSS của TV2 |
| Các API TV1 | `/api/health`, `/api/project-status`, `/api/storage-check` | Giữ nguyên mục đích và đường dẫn |
| Cấu hình Web SDK | File config frontend mẫu | UI mới đọc `/api/demo-config`; chỉ dữ liệu client công khai |
| Xác minh người dùng | Chưa có endpoint demo | `/api/auth/me` nhận Bearer ID token và trả UID/email đã xác minh |
| Chạy mới không có `.env` | Cần cấu hình cho phép thử Storage cloud | Mặc định emulator project `demo-firebase-storage`; không cần key/billing |

Trang mới dùng `/static/styles.css` và `/static/ui.js`. Các import tương đối trong JavaScript tiếp tục được giải quyết dưới `/static/`. FastAPI phục vụ HTML qua HTTP; không mở HTML bằng `file://`. Các file config frontend cũ được giữ cho tài liệu TV1; chúng không phải nguồn cấu hình của UI mới.

## Cấu hình và Admin SDK

`create_app(Settings)` cho phép tạo app với cấu hình rõ ràng. `Settings` cung cấp mode, project/bucket và Web config; `/api/demo-config` không trả credential backend hoặc nội dung private key.

Admin app dành cho xác minh người dùng được lấy **khi `/api/auth/me` cần dùng**, qua getter trên app state. Bởi vậy giao diện, các file static và public config có thể khởi động trong cloud mode khi chưa có ADC. Gọi endpoint xác minh vẫn cần credential backend hợp lệ; thiếu credential/dịch vụ xác minh không sẵn sàng trả **503**. Token thiếu hoặc không hợp lệ bị từ chối, không được coi là người dùng đã xác thực.

Luồng `/api/storage-check` của TV1 là phép kiểm tra Admin Storage riêng và vẫn đọc **file service-account** từ `GOOGLE_APPLICATION_CREDENTIALS` theo `app/firebase_client.py`; luồng này chưa hỗ trợ ADC/Workload Identity như auth mới. `STORAGE_ENABLED=false` trả `pending_blaze`; nếu bật cờ trong mode emulator, endpoint trả `emulator` và không gọi bucket cloud. Cờ này không tắt upload/list/get URL/delete của TV2 bằng Web SDK. Cấu hình/billing/IAM của cloud phải kiểm chứng riêng.

| Chế độ | Giá trị cần thống nhất |
|---|---|
| Emulator | `DEMO_MODE=emulator`, project `demo-firebase-storage`, Auth `127.0.0.1:9099`, Storage `127.0.0.1:9199` |
| Cloud | `DEMO_MODE=cloud`; đủ `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_APP_ID`; không còn biến emulator |
| Backend cloud — auth mới | ADC/Workload Identity hoặc `GOOGLE_APPLICATION_CREDENTIALS` tới service-account JSON riêng tư, thuộc project và có quyền phù hợp |
| Backend cloud — storage-check TV1 | Vẫn cần file service-account qua `GOOGLE_APPLICATION_CREDENTIALS`; ADC/Workload Identity đơn thuần chưa được luồng cũ hỗ trợ |

Thông tin project của nhóm được giữ: `student-file-hub-seminar-7a7f2`, bucket TV1 ghi nhận là `student-file-hub-seminar-7a7f2.firebasestorage.app`. Tên bucket trong cấu hình không có `gs://`. `.env.example` mặc định local; phần comment cloud là hướng dẫn điền, không phải cấu hình cloud đã chạy thành công.

## Hợp đồng phần 2

- Auth Web SDK xử lý Email/Password và `browserSessionPersistence`; backend không nhận password.
- Object key: `users/{uid}/{uuid}-{sanitizedName}`. Metadata/dữ liệu nghiệp vụ nên lưu object path thay vì dựa vào download URL.
- JPEG/PNG/WebP/PDF, **0 < size ≤5.242.880 byte**. UI kiểm tra sớm; Storage Rules cưỡng chế lại.
- List đúng prefix UID, 20 tệp/trang; gọi metadata cho các object trong trang.
- URL có download token là liên kết chia sẻ dài hạn; sign-out không thu hồi URL đã cấp.
- Upload hỗ trợ progress/cancel. Đổi tài khoản dọn danh sách/URL và bỏ kết quả bất đồng bộ thuộc phiên cũ; ẩn URL hoặc chọn URL mới vô hiệu hóa request URL trước đó.
- `/api/auth/me` xác minh ID token, bao gồm lựa chọn kiểm tra revocation của demo; không echo token. Đây là xác minh danh tính, chưa thay thế authorization nghiệp vụ.

Admin SDK dùng quyền server/IAM; Storage Rules bảo vệ luồng Client SDK. Nếu TV3 thêm API thao tác file bằng Admin SDK, API phải tự kiểm tra UID, ownership và quyền nghiệp vụ trước khi gọi Storage.

## File và tài liệu được giữ

Nền tảng TV1 gồm `app/firebase_client.py`, dashboard setup, các API health/status/storage check, cấu hình mẫu frontend và tài liệu setup/kiến trúc. Phần 2 bổ sung modules Auth/Storage/UI, router xác minh, cấu hình local và baseline Rules/tests để cả lớp tái sử dụng. Các câu “chưa triển khai upload/download/delete” trong tài liệu TV1 mô tả thời điểm trước tích hợp; README hiện tại là điểm bắt đầu chạy bản ghép.

Kết quả gói TV2 độc lập ngày 19/10 không tự chứng minh bản ghép hoạt động. Xem [verification.md](verification.md) cho kết quả bản ghép; xem [README](../README.md) cho hai quickstart. Chưa chạy trực tiếp Firebase cloud và không deploy Rules trong bước tích hợp này.
