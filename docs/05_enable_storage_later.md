# Bật Storage sau này (chỉ khi có Blaze và đã đồng ý thanh toán)

1. Firebase Console -> Upgrade -> Blaze, liên kết Cloud Billing hợp lệ.
2. Thiết lập Budget Alert; cảnh báo không chặn chi tiêu.
3. Firebase Console -> Storage -> Get Started, tạo bucket. Để xét hạn mức
   Always Free phù hợp, chọn khu vực us-central1, us-east1 hoặc us-west1.
4. Đọc chính xác tên bucket trên Firebase Console, thường là
   `PROJECT_ID.firebasestorage.app`, KHÔNG tự đoán hoặc điền `gs://`.
5. Đặt Rules an toàn theo phần của Thành viên 3.
6. Trên backend chạy bởi người trình bày, sử dụng service account key
   ở `secrets/serviceAccountKey.json` (KHÔNG commit). Prefer ADC/least
   privilege khi có thể. Chỉ cấp role cần thiết.
7. Trong `.env`:
```ini
FIREBASE_PROJECT_ID=<PROJECT_ID_THAT>
STORAGE_ENABLED=true
FIREBASE_STORAGE_BUCKET=<BUCKET_NAME_THAT>
GOOGLE_APPLICATION_CREDENTIALS=secrets/serviceAccountKey.json
```
8. Restart uvicorn; mở /api/storage-check. Thành công phải trả `status=ok`
   và đúng tên bucket thật. Nếu trả 503: xem log server, billing, role, path.
9. Sau đó TV2/TV3 mới thử các chức năng Storage và Security Rules thật.

Về Emulator: có thể dùng để kiểm thử trước Blaze nhưng chạy emulator
KHÔNG chứng minh project đã kết nối Firebase Storage cloud thật.

Tài liệu Firebase: https://firebase.google.com/docs/storage/web/start
