# FileSpace — đợt 3

Ứng dụng lưu trữ và chia sẻ tài liệu dùng FastAPI, Firebase Authentication và Cloud Storage. Bản 1.3.1 hoàn thiện thư mục, đổi tên/di chuyển, tìm kiếm toàn bộ danh sách, xem trước và khôi phục mật khẩu trên nền đợt 2.

## Đã hoàn thiện

- Thư mục nhiều cấp, breadcrumb, tạo/đổi tên/di chuyển và xóa thư mục rỗng. Tối đa 100 thư mục/tài khoản, 10 cấp; chặn vòng lặp, trùng tên thư mục cùng cấp và truy cập thư mục người khác.
- Đổi tên và di chuyển file giữ nguyên ID, nội dung, dung lượng và quyền chia sẻ. Thư mục tổ chức tài liệu; quyền được cấp riêng từng file.
- Tìm theo tên trên toàn bộ tài liệu của tôi, gồm mọi thư mục khi có từ khóa. Mục được chia sẻ và thùng rác cũng tìm trên toàn bộ danh sách được phép truy cập.
- Lọc PDF/ảnh và sắp xếp tên/ngày/dung lượng tại server trước khi phân trang 20 file. Cursor gắn với tài khoản, danh sách và bộ lọc.
- Xem trước PDF từng trang bằng PDF.js được đóng gói cục bộ; xem ảnh bằng blob riêng tư. Mọi lượt lấy nội dung kiểm tra lại quyền; đóng/chuyển phiên sẽ giải phóng bản xem trước.
- Quên mật khẩu: gửi hướng dẫn qua Firebase Authentication, thông báo chung cho email đã/chưa đăng ký. Demo emulator không gửi email thật.
- Giữ chia sẻ theo email đã đăng ký, thu hồi, thùng rác, khôi phục riêng tư và xóa vĩnh viễn. Người nhận chỉ xem/tải.
- Giữ giới hạn 10 MiB/file, 50 MiB và 200 file/tài khoản; thùng rác vẫn tính quota; tối đa 20 người nhận/file.

## Chạy demo cục bộ

Yêu cầu Python 3.11+, Node.js 24.12+, npm và JDK tương thích Firebase CLI (đã kiểm thử JDK 24). Trình duyệt cần internet để tải Firebase Web SDK; Auth/file chạy trong emulator cục bộ, không cần billing hay service account.

~~~powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm ci
Copy-Item .env.example .env
~~~

Giữ DEMO_MODE=emulator và FIREBASE_PROJECT_ID=demo-firebase-storage. Không ghi đè .env đang có khi nâng cấp một cấu hình đã hoạt động.

Terminal 1:

~~~powershell
npm run emulators
~~~

Terminal 2:

~~~powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011
~~~

Mở **http://127.0.0.1:8011/**; /setup kiểm tra hệ thống, /docs là API, http://127.0.0.1:4000/ là Emulator UI. Dừng bằng Ctrl+C. Nếu java không chạy được, thêm bin của JDK vào PATH.

Auth/Storage Emulator mặc định mất dữ liệu khi tắt. Nếu cần giữ demo, cấu hình import/export của Emulator Suite và giữ .data tương ứng.

## Nâng cấp từ đợt 2

1. Dừng server, sao lưu thư mục .data cùng dữ liệu Storage; giữ .env và credential của chính bạn.
2. Cập nhật source và chạy npm ci. Các tài nguyên PDF.js cần thiết đã có trong frontend/vendor/pdfjs.
3. Khởi động server. Schema SQLite tự bổ sung tên hiển thị, vị trí file và bảng thư mục trong giao dịch; giữ trạng thái thùng rác và quyền chia sẻ hiện có.
4. File cũ tự xuất hiện tại thư mục gốc. Raw Storage path không thay đổi khi đổi tên/di chuyển.

**Giữ project/.data/** hoặc FILESPACE_DATA_DIR khi nâng cấp. Đây là dữ liệu quyền chia sẻ, thùng rác, tên và thư mục, không phải cache. Các worker cần cùng thư mục metadata và .runtime/file-locks trên một server/filesystem hỗ trợ SQLite. Nhiều server độc lập cần khóa/giao dịch phân tán.

## Sử dụng

- Chọn Tài liệu của tôi → Tạo thư mục → mở thư mục để upload vào đó.
- Đổi tên hoặc Di chuyển cạnh file; hộp di chuyển có Thư mục gốc và đường dẫn thư mục đích.
- Gõ từ khóa để tìm xuyên mọi thư mục; xóa từ khóa để quay về thư mục đang mở. Chọn loại file và thứ tự trước khi sang trang tiếp theo.
- Chọn Xem trước để đọc PDF/ảnh bằng quyền hiện tại; PDF có nút trang trước/sau và tải xuống.
- Chia sẻ cho email tài khoản B; B mở Được chia sẻ với tôi. Đổi tên/di chuyển vẫn giữ grant. Trash thu hồi mọi grant; restore luôn riêng tư.
- Chỉ xóa được thư mục không có thư mục con hoặc file, kể cả file còn trong thùng rác.
- Ở trang đăng nhập, chọn Quên mật khẩu?. Cloud gửi email thật; emulator tạo thao tác cục bộ, có thể kiểm tra qua Auth Emulator.

Thùng rác chưa tự dọn theo ngày. Thu hồi quyền chặn lượt lấy dữ liệu mới, không thu hồi bản đã tải/xem trước hoặc lượt tải được cho phép trước đó.

## Kiểm thử và tài nguyên PDF

~~~powershell
.\.venv\Scripts\python.exe -m pytest -q
npm test
npm run test:emulators
~~~

Dừng emulator khác trước test:emulators vì lệnh tự khởi động/dừng dịch vụ. Integration chọn Python trong .venv; có thể đặt FILESPACE_TEST_PYTHON.

PDF.js 6.4.299 được khóa phiên bản, có LICENSE và tài nguyên worker/font/CMap/WASM trong frontend/vendor/pdfjs. Khi tái tạo tài nguyên sau npm ci:

~~~powershell
npm run vendor:pdf
~~~

Bộ xem chỉ dựng canvas, không chạy PDF scripts, biểu mẫu hoặc liên kết tương tác. PDF hỏng/được bảo vệ mật khẩu có thể cần tải về và mở bằng công cụ phù hợp. Xem [tài liệu PDF.js chính thức](https://mozilla.github.io/pdf.js/examples/).

Xem [kết quả kiểm thử](docs/verification.md) và [quy tắc/API](docs/file-operations.md).

## Cloud và phạm vi vận hành

Cloud cần Web config của chính bạn, Email/Password, Admin credential qua ADC hoặc GOOGLE_APPLICATION_CREDENTIALS, bucket riêng tư và storage.rules deny-all đã publish vào đúng project. Cả owner/recipient dùng API; browser không thao tác Storage trực tiếp.

Email xác minh được gửi tự động khi đăng ký. Người dùng chỉ cần mở liên kết trong email; FileSpace tự kiểm tra khi tab đang hiển thị (mỗi 5 giây), khi quay lại tab hoặc có mạng, rồi làm mới token trước khi báo thành công. Không còn nút “Tôi đã xác minh”. Nút gửi lại có thời gian chờ 60 giây; lỗi gửi không làm mất tài khoản đã tạo. Backend Cloud vẫn kiểm tra trạng thái từ Firebase Admin. Emulator tạo email/OOB cục bộ để demo, không gửi email thật.

Với URL token từ bản cũ, kiểm tra/thu hồi trước khi coi file cũ là riêng tư:

~~~powershell
.\.venv\Scripts\python.exe -m scripts.revoke_legacy_tokens
.\.venv\Scripts\python.exe -m scripts.revoke_legacy_tokens --apply --project YOUR_PROJECT_ID
~~~

Cloud Storage yêu cầu Blaze/Cloud Billing; mức miễn phí không phải cam kết hóa đơn 0 đồng. [Thông báo Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). Bản này chưa deploy hoặc kiểm thử bucket/email Cloud thật.

Hạn mức hiện phục vụ một server/demo. Chưa có rate limit, quét virus, chia sẻ thư mục, public link, OCR/tìm nội dung tài liệu hoặc đồng bộ máy tính. Upload hủy/timeout sau khi server nhận xong có thể vẫn lưu thành công; làm mới trước khi thử lại.

Các tài liệu seminar TV1/TV2 khác trong docs là lịch sử; README, docs/file-operations.md và docs/verification.md là tài liệu chuẩn cho đợt 3.


