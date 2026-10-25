# Kiểm thử FileSpace — đợt 3

Ngày 25/10/2026 (Asia/Bangkok). Chỉ dùng mock và demo-firebase-storage trên emulator; không dùng bucket/email Cloud thật.

| Nhóm | Kết quả |
|---|---|
| Python pytest, toàn bộ hồi quy | 103 đạt |
| JS file policy và UI contract | 8 đạt |
| Firebase Auth/Storage + FastAPI integration | 10 đạt, gồm 9 nhóm tình huống |
| Chrome desktop/mobile | Đạt, PDF được kiểm tra bằng canvas đã render |
| Nâng cấp SQLite đợt 2 | Đạt, giữ grants và trash |

## Phạm vi đã kiểm chứng

- Tạo/đổi tên/di chuyển thư mục, breadcrumb, ownership, cycle/self/cross-owner, trùng tên không phân biệt hoa/thường, 100 thư mục và 10 cấp kể cả subtree.
- Empty-only delete gồm active/trash refs; quota không đổi khi đổi tên/di chuyển.
- Rename/move giữ raw Storage path, grant và byte tải; metadata giữ sau FileService khởi động lại.
- Search tìm được file ngoài trang đầu; type/sort áp dụng trước paging; shared/trash không lộ file ngoài quyền.
- Cursor không dùng lẫn query, folder, UID hoặc view.
- Preview owner/recipient cùng ACL; guest401, người khác/revoke/trash404; MIME, inline, no-store, CSP và nosniff.
- Schema phase2 thật được migrate, giữ cả grant và trash.
- Cloud recipient email verification giữ đầy đủ kiểm thử đợt 2.
- Hạn mức, upload song song, Rules deny-all, thu hồi và purge failure vẫn đạt.
- Password recovery qua emulator: tạo yêu cầu, xác nhận, mật khẩu cũ thất bại, mật khẩu mới đăng nhập đúng UID. Không in OOB code/link trong kết quả.
- Trình duyệt: tạo thư mục → upload PDF hợp lệ → rename → share → preview render chữ thật → move root → global search → recipient download đúng byte/tên → mobile recipient → ảnh decode → quên mật khẩu.
- Lỗi MIME .mjs trên Windows được sửa; có hồi quy HTTP bảo đảm PDF.js và worker phục vụ với JavaScript MIME.
- Tài khoản, file và thư mục QA đã dọn sau chạy. Không gửi email thật.

PDF dùng PDF.js 6.4.299 cục bộ và canvas, không iframe native (Chrome chặn sandbox PDF). Worker và tài nguyên được đóng gói cùng source. Cơ chế preview dọn khi đóng/đổi phiên, không phát public token.

## Bằng chứng giao diện

- [Desktop](phase3-desktop.png)
- [Xem trước PDF thực tế](phase3-preview-desktop.png)
- [Người nhận trên điện thoại](phase3-mobile.png)
- [Quên mật khẩu](phase3-recovery-desktop.png)

## Chạy lại

~~~powershell
.\.venv\Scripts\python.exe -m pytest -q
npm test
npm run test:emulators
~~~

Dừng emulator khác trước test:emulators. Integration tự chọn Python .venv và metadata tạm riêng; cần Node24.12+, JDK và Python dependencies. Một warning Starlette/httpx deprecation không làm test thất bại.

Chưa deploy/publish Rules lên Cloud hoặc gửi email Cloud thật. Cần giữ .data khi nâng cấp, bucket riêng tư, Admin IAM và thu hồi token cũ theo README.

- [PDF được dựng trên điện thoại](phase3-preview-mobile.png)

## Bổ sung 1.3.1 — xác minh email tự động

- JavaScript: 17 kiểm thử đạt (9 kiểm thử controller), bao gồm hủy khi đổi phiên, dừng khi ẩn tab, tránh gọi chồng, thử lại có backoff, lỗi token sau reload và quay lại từ bfcache.
- Emulator integration: 11 kiểm thử đạt, gồm xác minh qua action code hợp lệ và controller tự phát hiện, cập nhật claim email_verified mà không gọi nút xác nhận.
- Chrome: tự gửi đúng một email khi đăng ký; xác minh ở tab khác; trang gốc tự cập nhật cả nhãn và ID token; gửi mail thất bại vẫn giữ tài khoản; đăng xuất dừng đồng bộ. Tài khoản QA đã dọn.
- Không gửi email Cloud thật, không sửa email_verified bằng Admin hoặc tin trạng thái từ URL.
- [Giao diện sau khi tự đồng bộ xác minh](auto-verification-desktop.png).
