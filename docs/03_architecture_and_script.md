# Architecture & Script – Thành viên 1 (14 phút)

## Kiến trúc mục tiêu (sau khi có Blaze)
```
 Student / Browser
     ├── Firebase Web SDK -> Firebase Authentication -> ID Token
     ├── Firebase Web SDK -> Firebase Storage (Security Rules kiểm soát)
     └── REST request + ID Token -> Python FastAPI
                                  └── Admin SDK -> Firebase Storage
                                      (backend tự kiểm tra quyền)
```
**Hiện tại** Storage chưa kích hoạt: chỉ thực thi khối FastAPI nền và cấu
hình Firebase Authentication/Web App.

## Luồng cần nói trên slide
1. Client đăng nhập bằng Firebase Authentication, nhận ID Token.
2. Client upload qua Web SDK; khi đã có bucket, Security Rules kiểm tra UID,
   định dạng, kích thước và đường dẫn file.
3. FastAPI phục vụ các REST API. Nếu dùng Admin SDK để truy cập Storage,
   backend phải tự verify ID Token và kiểm tra phân quyền (TV3 phụ trách).
4. Firebase Storage lưu file; download URL có thể được chia sẻ, không dùng như
   cơ chế phân quyền chính cho tài liệu riêng tư.

## Kịch bản 14 phút
- **00:00–02:00 – Business problem:** nhiều sinh viên nộp báo cáo, ảnh, PDF;
  tự lưu trên server khó mở rộng và quản lý quyền. Firebase Storage giải quyết
  hạ tầng lưu trữ file, không thay thế toàn bộ database/backend.
- **02:00–04:00 – Overview:** Storage dựa trên Cloud Storage bucket, Firebase
  Auth nhận diện người dùng, Rules bảo vệ client request.
- **04:00–06:00 – Architecture:** chỉ đường Client SDK và Backend Admin SDK;
  nhấn mạnh Admin SDK không bị kiểm tra bởi Storage Rules.
- **06:00–09:00 – Firebase Console:** chiếu Project ID, Web App, Email/Password
  Enabled; nói rõ Storage còn chờ Blaze (không tuyên bố đã tạo bucket).
- **09:00–12:00 – Hands-on:** chạy `uvicorn`, mở giao diện, /docs và /api/health.
- **12:00–14:00 – Checkpoint:** người nghe gọi /api/health, /api/project-status,
  giải thích Storage hiện pending_blaze; giới thiệu phần thực hành CRUD của TV2.

## Các câu vấn đáp thường gặp
Q: Firebase Storage giải quyết bài toán kinh doanh gì?
A: Lưu trữ/phân phối tệp do người dùng tạo, tách file khỏi máy chủ nghiệp vụ,
   có thể mở rộng và dùng với Firebase Auth/Rules.

Q: Tích hợp vào Spring Boot microservice thế nào?
A: Spring Boot REST Controller nhận request/ID Token -> Firebase Admin SDK
   xác thực -> service kiểm tra nghiệp vụ/quyền -> thao tác Storage Bucket;
   Java dùng Firebase Admin SDK for Java thay cho Python.

Q: Đồ án nào dùng được?
A: LMS nộp bài PDF, thương mại điện tử lưu ảnh sản phẩm,
   tuyển dụng nhận CV, ứng dụng mạng xã hội chứa ảnh.

Q: Tại sao không upload được trước Blaze?
A: Google yêu cầu Blaze để tạo/truy cập Cloud Storage for Firebase bucket;
   nhóm đã hoàn thành phần setup và FastAPI, tạm hoãn thao tác Cloud thật.
