# FileSpace – giao diện người dùng (UI/UX)

## Mục tiêu

Giao diện của **Student File Hub** được thiết kế theo nghiệp vụ quản lý tài liệu cá nhân, thay cho cách trình bày theo từng phần seminar. Đây vẫn là frontend HTML/CSS/JavaScript thuần, sử dụng các module Firebase Web SDK sẵn có và Python FastAPI hiện tại; không yêu cầu React hoặc thêm cơ sở dữ liệu.

## Các luồng người dùng

1. **Chưa đăng nhập:** người dùng xem trang tổng quan, đăng ký hoặc đăng nhập bằng Email/Password. Danh sách, tìm kiếm, tải lên bị khóa cho đến khi xác thực.
2. **Đã đăng nhập:** hệ thống tải danh sách file riêng của tài khoản trong `users/{uid}/`; hiển thị thống kê **chỉ cho trang hiện tại**.
3. **Upload:** bấm "Tải tệp lên", chọn/kéo thả 1 JPEG/PNG/WEBP/PDF tối đa 5 MiB; hệ thống kiểm tra đầu vào, hiển thị tiến trình, cho hủy và cập nhật danh sách sau khi hoàn tất.
4. **Quản lý:** tìm theo tên, lọc PDF/ảnh, sắp xếp theo thời gian/tên/kích thước **trong trang đang xem**; nút Làm mới cập nhật dữ liệu từ Firebase. Danh sách backend phân trang 20 tệp/lượt nên tìm kiếm chưa phải toàn bucket.
5. **Chia sẻ:** nhấn "Lấy liên kết" ở một file, sau đó sao chép hoặc mở URL. Giao diện cảnh báo rằng link download token có thể truy cập được mà không cần đăng nhập.
6. **Xóa:** nhấn "Xóa", kiểm tra tên file trên dialog, chọn "Giữ lại" hoặc "Xóa vĩnh viễn". Ứng dụng chỉ gọi Firebase khi người dùng xác nhận.
7. **Kỹ thuật:** chi tiết Project ID, Bucket, UID và thử nghiệm `/api/auth/me` được đưa vào vùng `<details>` để không làm phiền người dùng cuối.

## Các file đã sửa

- `frontend/index.html`: layout dashboard, sidebar, topbar, thống kê trang, thư viện, khu vực upload, tài khoản, liên kết, dialog xóa.
- `frontend/styles.css`: hệ thống giao diện responsive desktop/tablet/mobile, trạng thái empty/error, input/button/focus.
- `frontend/ui.js`: cập nhật DOM theo giao diện mới, lọc/sắp xếp trong trang, thống kê, hiện/ẩn mật khẩu, dialog xác nhận, giới hạn theo phiên đăng nhập.

Các module `frontend/auth.js`, `frontend/storage.js`, `frontend/firebase-client.js`, `frontend/file-policy.js` không bị thay đổi nghiệp vụ. Backend FastAPI, Security Rules và API cũ được giữ nguyên.

## Hướng dẫn chạy

1. Dùng file `.env.example` tạo `.env` và tự điền `DEMO_MODE=cloud`, Project ID, API Key Web, Auth Domain, App ID, Bucket và Service Account *phía backend*. Xem `docs/setup.md`.
2. Trên Windows:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
   ```

3. Mở `http://127.0.0.1:8000/`. Cấu hình Web SDK được lấy từ `/api/demo-config` chứ **không** chèn khóa Admin vào HTML.
4. Nếu Firebase Storage vẫn ở Production mode mặc định từ chối mọi truy cập client, tính năng upload/list/delete sẽ bị chặn cho đến khi Thành viên 3 kiểm thử và triển khai `storage.rules` phù hợp.
5. Chạy `node --test tests/ui-contract.test.js tests/file-policy.test.js` để kiểm tra giao diện ở mức cấu trúc và policy. Chạy `npm run test:emulators` để kiểm tra Rules/Storage với Emulator khi đã cài đủ dependencies.

## Giới hạn & lưu ý

- Các ảnh screenshot thiết kế trong `docs/` chỉ để tham khảo bố cục; số liệu trong bản mockup không phải dữ liệu Firebase thật.
- Dung lượng, số tài liệu và số ảnh được tính từ **20 tệp của trang đang tải**, không phải tổng bộ nhớ Cloud Storage; khi chuyển trang các thống kê sẽ thay đổi.
- Tên file trong bảng được rút gọn tiền tố UUID để dễ đọc, nhưng Firebase object name và full path gốc vẫn giữ nguyên để thao tác đúng tệp.
- Web Config không phải service account private key. Không push `.env` hoặc `secrets/serviceAccountKey.json`.
- Dialog xác nhận xóa bổ sung an toàn UX, không thay thế Storage Security Rules hoặc phân quyền backend.

## Hình tham khảo

- `docs/design-preview-desktop.png`: mô phỏng giao diện desktop sau đăng nhập, dùng tệp giả lập để kiểm thử UI.
- `docs/design-preview-mobile.png`: giao diện responsive khi chưa đăng nhập.

Hai ảnh trên chỉ là ảnh giao diện thử nghiệm, không phải minh chứng rằng Firebase Cloud thật đã kết nối được.
