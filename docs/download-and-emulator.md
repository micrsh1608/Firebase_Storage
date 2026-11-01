# Thay đổi tải xuống và hỗ trợ emulator

## Tải trực tiếp từ server

Luồng cũ có gọi `GET .../content` với Bearer token, sau đó gom response thành
Blob, tạo `URL.createObjectURL()` và click link `blob:` để lưu.

Luồng mới dùng form POST native trong iframe ẩn:

1. Lấy Firebase ID token của phiên hiện tại, kiểm tra phiên/thư viện chưa đổi.
2. Trình duyệt gửi `POST /api/files/{name}/download`, hoặc
   `POST /api/files/shared/{ownerUid}/{name}/download`.
3. Token nằm trong body `application/x-www-form-urlencoded` (`idToken`),
   vì form native không đặt được Authorization header. Không đặt token vào URL.
4. Server dùng cùng Firebase Admin verifier (`check_revoked=True`), kiểm tra
   chủ sở hữu hoặc quyền chia sẻ còn hiệu lực, trạng thái file còn hoạt động.
5. Server trả nội dung với `Content-Disposition: attachment; filename*=UTF-8''...`
   và `Content-Length`. Tên tệp lấy từ metadata hiện tại trên server.
6. Trình duyệt lưu HTTP attachment trực tiếp. Error JSON được iframe đọc lại để
   hiển thị thông báo trên trang. Token trong form được xóa ngay sau submit.

Server giữ `Referrer-Policy: no-referrer`. Theo [tài liệu HTTP Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin),
form POST có thể gửi `Origin: null` với policy này. Trường hợp đó chỉ được chấp
nhận khi trình duyệt gửi `Sec-Fetch-Site: same-origin`; vẫn phải xác thực ID token.

Không tạo public Storage URL hay download token. Các route GET `/content` và
`/preview` vẫn yêu cầu Bearer token. Xem trước vẫn dùng Blob/PDF.js; nút tải
trong cửa sổ xem trước gọi cùng luồng POST mới.

Giao diện chỉ xác nhận đã gửi yêu cầu; trình duyệt quản lý tiến độ và việc lưu.
`downloadFileWithProgress()` được giữ làm alias cho luồng native, không trả Blob
và không gọi callback tiến độ JavaScript. Backend hiện vẫn đọc tối đa 10 MiB
từ Storage vào bộ nhớ trước khi phản hồi, phù hợp giới hạn file hiện tại.

## Emulator

`npm run dev:emulator` khởi động Firebase CLI và API; `npm run api:emulator`
kết nối API tới emulator có sẵn. `app/emulator.py` cưỡng chế project demo,
không đọc private key cloud, tách metadata local. Xem [emulator.md](emulator.md).

Bản ZIP nguồn thiếu `tests/fixtures/preview.pdf` mặc dù integration test tham
chiếu file này; bản sửa bổ sung fixture PDF hợp lệ và `tests/__init__.py`.
