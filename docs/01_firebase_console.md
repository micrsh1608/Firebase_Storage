# Bước A – Firebase Console (làm ngay, không cần Blaze)

1. Truy cập https://console.firebase.google.com/.
2. Chọn project bạn đã tạo để nâng cấp trước đó; không cần tạo mới nếu project
   đã có. Nếu chưa có, bấm Create a project; Google Analytics có thể tắt.
3. Project overview > biểu tượng bánh răng > Project settings > General:
   chép **Project ID** chính xác vào `.env` ở `FIREBASE_PROJECT_ID`.
4. Trong Project settings > General, tìm **Your apps** > Web (`</>`)
   > Register app. Đặt nickname `student-file-hub-web`.
5. Sao chép object `firebaseConfig` của Web App, điền các trường vào bản sao
   `frontend/firebase-config.example.js` (tên mới: `frontend/firebase-config.js`)
   để bàn giao cho Thành viên 2. Cấu hình Web không phải private key; tuy nhiên
   vẫn giới hạn quyền trong Auth/Rules và API bên ngoài.
6. Menu Build/Security > Authentication > Get started > Sign-in method >
   Email/Password > Enable > Save.
7. (Tuỳ chọn) Authentication > Users > Add user để tạo **tài khoản thử riêng**;
   không ghi mật khẩu mẫu trong slide/repository.
8. Mở Storage: Firebase yêu cầu nâng cấp Blaze. DỪNG tại đây; không tạo bucket,
   không tìm cách bypass billing. Ghi nhận là 'chưa hoàn thành – chờ Blaze'.

## Bằng chứng / ảnh chụp cho slide
- Project settings hiện Project ID (che dữ liệu không cần thiết).
- Web App đã được đăng ký.
- Sign-in method có Email/Password = Enabled.
- Terminal FastAPI và /api/health chạy thành công.
- /api/storage-check hiển thị `pending_blaze` (ghi rõ còn thiếu Storage thật).

## Phạm vi hoàn thành thực tế
Tạo project/web app và bật Authentication hoàn toàn làm được trên Spark.
Chưa chứng minh được bucket, upload hoặc kết nối Storage thật khi chưa lên Blaze.
