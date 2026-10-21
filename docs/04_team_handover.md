# Bàn giao cho nhóm

## TV1 (bạn) bàn giao
- Firebase Project ID.
- File `frontend/firebase-config.js` gồm cấu hình Web App công khai lấy từ Console.
- FastAPI base (`app/main.py`), firebase_client.py, docs, requirements.
- Screen record / screenshot health API và bật Authentication.
- README cài đặt Windows.

## Thành viên 2 (Auth + file CRUD)
- Dùng Firebase Web SDK cho Auth; chưa thể dùng Storage thật khi Blaze chưa
  kích hoạt. Có thể phát triển giao diện đăng ký/đăng nhập trên Spark.
- Thiết kế module `frontend/auth.js`, `frontend/storage.js` theo interface;
  thao tác upload/list/download/delete thật để sau Blaze hoặc dùng Emulator.
- File của người dùng: `users/{uid}/files/{uuid}-{filename}` (quy ước đề xuất).

## Thành viên 3 (Security Rules + Spring Boot integration)
- Viết `storage.rules`, kiểm tra bằng Firebase Emulator (hoặc chờ Blaze).
- Không dùng Admin SDK để 'chứng minh Rules chặn truy cập', vì Admin SDK
  có quyền server; dùng Client SDK/Emulator Rules test.
- Nếu xây dựng backend thao tác file: verify ID Token và phân quyền bằng code.

## Không bàn giao những thứ sau
- Không gửi service account JSON, `.env`, private key hay thẻ ngân hàng.
- Không cho lớp dùng chung quyền Editor/Owner trên Firebase project chính.

## Checklist TV1
[ ] Project ID ghi nhận
[ ] Web App được đăng ký
[ ] Email/Password Auth bật
[ ] FastAPI và Swagger hoạt động
[ ] API Health hoạt động
[ ] Sơ đồ kiến trúc và 6 slide đã sẵn sàng
[ ] Source push vào branch riêng (không có key)
[ ] Storage thật: CHƯA (cần Blaze)
