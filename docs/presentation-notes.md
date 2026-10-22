# Kịch bản seminar — Thành viên 2: Authentication & File Operations

**Thời lượng gợi ý:** 9 phút trình bày và demo; phần hỏi đáp thêm 1–2 phút theo thời gian của nhóm. Đây là nội dung cho 7 slide để đưa vào deck chung. Các thao tác dưới đây là kịch bản cần diễn tập, không phải biên bản xác nhận đã chạy trên Firebase cloud.

**Phạm vi của tôi:** đăng ký, đăng nhập, nhận biết người dùng qua UID, upload ảnh/PDF, liệt kê file, lấy URL tải xuống, xóa và đăng xuất. Thành viên 1 trình bày khởi tạo project/bucket; thành viên 3 trình bày đầy đủ Rules, kiểm thử tài khoản A/B và tích hợp Spring Boot.

## Slide 1 — Technology Overview: Từ file đính kèm đến tính năng sản phẩm

**Thời gian: 0:00–0:40**

Nội dung trên slide:

- Người dùng cần đính kèm ảnh hoặc PDF vào nghiệp vụ.
- Firebase Authentication cung cấp danh tính; Cloud Storage lưu nội dung file.
- Demo: đăng nhập → upload → xem danh sách → mở/tải → xóa.
- Ví dụ: ảnh sản phẩm, bài nộp LMS, CV ứng tuyển.

Lời nói gợi ý:

> Trong đồ án, một đơn hàng có thể cần ảnh minh chứng, một lớp học có bài nộp PDF, hoặc một hồ sơ ứng tuyển có CV. Phần của em biến khả năng lưu file thành một luồng người dùng sử dụng được. File nằm trong Storage; dữ liệu nghiệp vụ như mã bài tập, đơn hàng và trạng thái duyệt vẫn thuộc database của ứng dụng. Demo dùng dữ liệu giả, không dùng hồ sơ thật.

**Câu hỏi thực tiễn 2.1 — Bài toán kinh doanh:** tiếp nhận, lưu và truy xuất file gắn với người dùng; giảm phần tự xây dựng hệ thống lưu file để tập trung vào nghiệp vụ. Đây là lựa chọn kiến trúc cho đồ án, không phải cam kết rằng Firebase luôn rẻ hơn hoặc phù hợp mọi sản phẩm.

## Slide 2 — Architecture & Workflow: Hai đường đi của cùng danh tính

**Thời gian: 0:40–1:35**

Nội dung trên slide:

```text
Browser ── email/password ──> Firebase Authentication
        <──── User + UID ────
   │
   ├─ Web Storage SDK + thông tin Auth ─> Security Rules ─> Storage
   │                     users/{uid}/{uuid}-{sanitizedName}
   │
   └─ ID token trong Authorization: Bearer … ─> FastAPI /api/auth/me
                                                    │
                                           Admin SDK xác minh
                                                    │
                                           Trả thông tin người dùng
```

Lời nói gợi ý:

> Email và mật khẩu được gửi đến Firebase Authentication bằng Web SDK. Sau khi đăng nhập, SDK quản lý phiên và ID token. Khi dùng Storage SDK, SDK tự gắn thông tin xác thực; Rules quyết định người này được thao tác đường dẫn nào. Khi gọi API riêng, frontend lấy ID token rồi gửi qua Bearer header. Backend phải xác minh token trước khi tin UID. Hai đường này dùng cùng danh tính nhưng có điểm kiểm tra quyền khác nhau.

Trong demo, frontend tải cấu hình công khai từ `GET /api/demo-config`. Endpoint này không được trả private key hoặc service-account JSON. Chỉ hiển thị kết quả xác minh từ `/api/auth/me`, không hiển thị hoặc ghi log ID token. Trên cloud dùng HTTPS; `http://127.0.0.1:8000` chỉ dành cho demo local. Firebase hướng dẫn backend xác minh ID token và lấy UID từ kết quả đã xác minh. [Nguồn: Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Slide 3 — Authentication: Có người dùng trước khi có file

**Thời gian: 1:35–2:10**

Nội dung trên slide:

- `createUserWithEmailAndPassword`: tạo tài khoản, đồng thời đăng nhập.
- `signInWithEmailAndPassword`: đăng nhập tài khoản có sẵn.
- `onAuthStateChanged`: cập nhật giao diện theo phiên.
- `browserSessionPersistence`: giữ phiên trong tab hiện tại.
- `signOut`: kết thúc phiên phía client.

Lời nói gợi ý:

> Em không tự lưu mật khẩu và không tự tạo JWT. Firebase SDK đảm nhận Authentication. Giao diện lắng nghe thay đổi phiên để bật các thao tác file và hiện UID. Demo chọn lưu phiên theo tab, phù hợp khi trình bày trên máy dùng chung: tải lại trang vẫn có phiên; đóng tab sẽ kết thúc phiên đó. Đăng xuất chủ động vẫn là thao tác cần làm sau demo.

Đăng ký thành công tự đăng nhập; không cần bấm đăng nhập ngay sau đăng ký. Để minh họa đủ hai thao tác, kịch bản sẽ đăng ký, đăng xuất rồi đăng nhập lại. [Nguồn: Password authentication](https://firebase.google.com/docs/auth/web/password-auth), [Auth state persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence).

## Slide 4 — Hands-on Demonstration: Thực hiện trọn vòng đời file

**Thời gian: 2:10–5:25**

Nội dung trên slide:

1. Đăng ký, đăng xuất, đăng nhập lại.
2. Xác minh danh tính qua FastAPI.
3. Upload một ảnh và một PDF, quan sát tiến độ.
4. Liệt kê file, lấy URL rồi mở/tải.
5. Xóa một file, làm mới danh sách, đăng xuất.

### Chuẩn bị trước giờ trình bày

- Mở ứng dụng ở `http://127.0.0.1:8000`; xác nhận giao diện ghi chế độ emulator.
- Firebase project local: `demo-firebase-storage`; Auth emulator `127.0.0.1:9099`; Storage emulator `127.0.0.1:9199`.
- Khởi chạy theo README. Tất cả thành phần phải dùng cùng project ID.
- Chuẩn bị một ảnh nhỏ và một PDF giả, mỗi file tối đa **5 MiB = 5.242.880 byte**. Demo chấp nhận `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- Dùng địa chỉ email demo mới trong Auth emulator và mật khẩu riêng cho buổi demo; không chiếu mật khẩu thật hoặc service-account JSON.
- Nếu SDK được tải từ CDN thì vẫn cần mạng để tải SDK. Emulator chạy local không có nghĩa mọi tài nguyên frontend đều có sẵn ngoại tuyến.
- Tập chạy toàn bộ luồng; chuẩn bị ảnh chụp/video dự phòng nếu tự ghi được. Nếu dùng dự phòng, nói rõ đó là bản ghi, không gọi là demo trực tiếp.

### Lịch thao tác và lời nói

| Mốc trong slide 4 | Thao tác | Điểm giải thích và dấu hiệu cần thấy |
|---|---|---|
| 0:00–0:35 | Nhập email demo, đăng ký; ghi nhận UID; đăng xuất rồi đăng nhập lại | Đăng ký tạo user và đăng nhập; đăng nhập lại phải cho cùng UID. Không đọc mật khẩu thành tiếng. |
| 0:35–0:55 | Bấm chức năng kiểm tra danh tính/API | `/api/auth/me` trả danh tính đã xác minh, UID khớp giao diện. Không mở phần request header trên máy chiếu. |
| 0:55–1:35 | Chọn ảnh, upload; sau đó chọn PDF, upload | Nêu MIME và 5 MiB; quan sát tiến độ. Tên object có UUID, đặt dưới `users/{uid}/`. |
| 1:35–1:55 | Làm mới danh sách | Hai object xuất hiện. Danh sách dùng phân trang 20 mục; nút trang tiếp chỉ cần trình bày khi có đủ dữ liệu. |
| 1:55–2:30 | Lấy URL một file, dùng chức năng mở/tải | Phân biệt object reference với URL có token. Demo đặt `Content-Disposition: attachment`, nên trình duyệt ưu tiên tải xuống; kiểm tra file đã tải. |
| 2:30–2:55 | Xóa một file, xác nhận nếu giao diện yêu cầu, làm mới | Object đã xóa không còn trong danh sách. Chỉ xóa dữ liệu demo của mình. |
| 2:55–3:15 | Đăng xuất | Thông tin người dùng/danh sách được xóa khỏi giao diện, thao tác có xác thực bị khóa. URL đã sao chép không bị tự thu hồi vì đăng xuất. |

Chuyển đoạn sau demo:

> Như vậy người dùng đã thực hiện được một vòng đời file hoàn chỉnh. Điểm tiếp theo là cách tái sử dụng luồng này trong một microservice và cách hiểu đúng quyền truy cập của link tải.

## Slide 5 — File references, Download URLs & Integration

**Thời gian: 5:25–6:40**

Nội dung trên slide:

| Khái niệm | Vai trò trong demo |
|---|---|
| `StorageReference` | Đại diện object theo bucket và đường dẫn; tạo reference chưa upload file. |
| `users/{uid}/{uuid}-{sanitizedName}` | Tách file theo chủ sở hữu và giảm trùng tên. Rules vẫn phải kiểm tra UID. |
| `getDownloadURL(reference)` | Trả URL tải dài hạn có token; người có URL có thể truy cập. |
| ID token | Chứng minh danh tính khi gọi backend; khác token trong URL file. |
| Database nghiệp vụ | Nên lưu object path và quan hệ nghiệp vụ; tránh dùng URL làm khóa file. |

Lời nói gợi ý:

> Reference giống một địa chỉ logic của object, còn download URL là một đường dẫn có thể đưa cho trình duyệt mở. Token trong URL không phải ID token của tài khoản. Link này dài hạn, không phải signed URL tự hết hạn sau vài phút. Đăng xuất không thu hồi link đã chia sẻ. Vì vậy em chỉ dùng file mẫu công khai được; với CV hoặc bài nộp riêng tư, nhóm cần thiết kế tải có kiểm tra quyền hoặc cơ chế URL thời hạn phù hợp.

Firebase mô tả download URL là dài hạn; tài liệu reference cũng nêu token có thể được thu hồi. Việc kết luận không nên dùng link đó như một phiên đăng nhập là suy luận từ đặc tính này. [Nguồn: Web StorageReference](https://firebase.google.com/docs/reference/js/v8/firebase.storage.Reference#getdownloadurl), [StorageReference và token thu hồi](https://firebase.google.com/docs/reference/android/com/google/firebase/storage/StorageReference#getDownloadUrl()).

**Câu hỏi thực tiễn 2.2 — Tích hợp microservice/Spring Boot:** phần demo dùng FastAPI để minh họa `Authorization: Bearer <ID token>` → Admin SDK xác minh → lấy UID → xử lý nghiệp vụ. Spring Boot có thể giữ cùng hợp đồng HTTP, dùng Admin SDK Java để xác minh token; frontend Storage SDK vẫn dùng lại được. Nếu backend dùng quyền Admin để thao tác file, backend phải tự kiểm tra quyền nghiệp vụ. Chi tiết code Spring Boot và so sánh quyền Admin/Rules do thành viên 3 trình bày; phần này không triển khai proxy upload qua backend.

## Slide 6 — Best Practices & Limitations

**Thời gian: 6:40–7:35**

Nội dung trên slide:

- Kiểm tra loại/kích thước ở UI để báo lỗi sớm; Rules là lớp cưỡng chế cho thao tác trực tiếp.
- Dùng UUID và tên đã làm sạch; quyền sở hữu dựa vào UID đã xác thực.
- Phân trang `list(..., {maxResults: 20})`; không tải mọi file bằng `listAll()` khi dữ liệu lớn.
- Dùng trạng thái loading/progress và xử lý lỗi mạng/quyền.
- Không log token, mật khẩu hoặc URL nhạy cảm; không đưa service-account key vào frontend.
- Emulator hỗ trợ diễn tập; cloud cần cấu hình và kiểm tra riêng.

Lời nói gợi ý:

> MIME do client cung cấp không chứng minh nội dung file là an toàn. Ứng dụng thật có thể cần kiểm tra chữ ký file, quét nội dung hoặc quy trình kiểm duyệt ở backend. List API cần Rules version 2, và phân trang giúp tránh tải toàn bộ danh sách khi số file tăng. Phần kiểm tra tài khoản A không truy cập file B do thành viên 3 phụ trách.

[Nguồn: Upload files](https://firebase.google.com/docs/storage/web/upload-files), [List files và Rules v2](https://firebase.google.com/docs/storage/web/list-files).

Lưu ý cloud hiện hành: FAQ của Firebase ghi yêu cầu Blaze cho Cloud Storage có hiệu lực từ **03/02/2026**. Không giới thiệu demo cloud là “không cần billing” hoặc cam kết miễn phí. Thành viên 1 kiểm tra project/bucket và billing trước khi trình bày cloud. [Nguồn: Storage billing FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

## Slide 7 — Reusable Source Code & Documentation + Q&A

**Thời gian: 7:35–9:00; hỏi đáp thêm theo thời gian nhóm**

Nội dung trên slide:

- `frontend/auth.js`: phiên đăng nhập và nhận dạng user.
- `frontend/storage.js`: upload, danh sách, URL, xóa.
- `frontend/index.html`: giao diện sử dụng lại.
- `app/routes/auth_demo.py`: endpoint xác minh danh tính.
- `docs/file-operations.md`: cách chạy, luồng xử lý và xử lý lỗi.
- `docs/team-handoff.md`: hợp đồng tích hợp và ma trận diễn tập.

**Câu hỏi thực tiễn 2.3 — Đồ án nào hưởng lợi?**

| Loại đồ án | Dùng phần demo thế nào? | Phần phải bổ sung |
|---|---|---|
| Thương mại điện tử | Người bán upload ảnh sản phẩm | Quan hệ seller/product; kiểm duyệt; ảnh thumbnail. |
| LMS | Sinh viên nộp PDF bài tập | Hạn nộp; quyền giảng viên; quyền tải riêng tư. |
| Tuyển dụng | Ứng viên gửi CV | Chính sách truy cập/thu hồi, lưu giữ dữ liệu; không phát link dài hạn cho tài liệu nhạy cảm. |
| Helpdesk | Đính kèm ảnh lỗi/tài liệu vào ticket | Quyền nhóm hỗ trợ; giới hạn số file và dung lượng. |

Đây là các đề xuất áp dụng từ luồng demo, không phải tính năng đã triển khai trong gói này.

**Câu hỏi thực tiễn 2.4 — Bạn cùng lớp dùng lại ngay ra sao?** Chạy bản emulator theo README; đi qua kịch bản trong `docs/file-operations.md`; dùng `auth.js` và `storage.js` làm lớp thao tác file; nối object path với database của đồ án. Chuyển sang cloud chỉ sau khi thành viên 1 cấu hình project/bucket, thành viên 3 rà soát Rules và nhóm chạy lại ma trận kiểm tra. Không cần viết lại Authentication hoặc chuyển toàn bộ binary qua microservice chỉ để giữ cấu trúc demo này.

Lời kết gợi ý:

> Phần em bàn giao là một luồng người dùng và code mẫu có thể ghép vào đồ án: danh tính người dùng, file theo UID, các thao tác cơ bản và một API chứng minh token được backend xác minh. Sau đây thành viên 3 sẽ kiểm chứng quyền truy cập và trình bày tích hợp sâu hơn.

### Câu hỏi thường gặp và câu trả lời ngắn

1. **Đăng nhập ở frontend thì backend có cần kiểm tra nữa không?** Có. Backend chỉ tin UID sau khi xác minh ID token; không tin UID tự gửi trong JSON hoặc query string. Xác thực xong vẫn phải kiểm tra quyền nghiệp vụ.
2. **Firebase API key trong cấu hình frontend có phải private key không?** Không phải service-account private key. Cấu hình client là dữ liệu frontend cần; quyền truy cập file vẫn phải được cấu hình và kiểm thử. Không đưa credential của Admin SDK vào client.
3. **Đăng xuất thì link tải cũ hết hiệu lực không?** Không tự hết hiệu lực vì đăng xuất. Download URL có token riêng, dài hạn; phải thiết kế/thu hồi quyền link phù hợp nếu nội dung nhạy cảm.
4. **Đổi tên file thành `.pdf` có vượt được giới hạn không?** Kiểm tra MIME/kích thước không xác minh toàn bộ nội dung. Cần kiểm tra sâu hơn nếu yêu cầu sản phẩm đòi hỏi. Phần này không triển khai antivirus.
5. **Cần FastAPI để upload không?** Trong demo này file đi trực tiếp từ Web SDK đến Storage; FastAPI phục vụ frontend/cấu hình và endpoint xác minh user. Backend riêng vẫn cần cho nghiệp vụ mà client không được tự quyết định.
6. **Có thể thay FastAPI bằng Spring Boot không?** Có thể giữ Web SDK và hợp đồng Bearer token; backend Java xác minh token bằng Admin SDK Java rồi xử lý nghiệp vụ. Code và kiểm thử cụ thể thuộc phần thành viên 3.
7. **Emulator chứng minh cloud đã hoạt động chưa?** Chưa. Cloud có thêm cấu hình thật, billing, origin/network, IAM và hành vi môi trường cần kiểm tra. Gói demo không phải xác nhận chạy cloud thực tế. [Nguồn: Connect Storage emulator](https://firebase.google.com/docs/emulator-suite/connect_storage).

## Kiểm tra đủ cấu trúc yêu cầu

| Mục bắt buộc | Nơi trong phần trình bày này |
|---|---|
| Technology Overview (What problem does it solve?) | Slide 1; câu hỏi 2.1. |
| Architecture & Workflow | Slide 2–3; danh tính, Rules và backend. |
| Hands-on Demonstration | Slide 4; chu trình người dùng có mốc thời gian. |
| Integration | Slide 5; hợp đồng FastAPI và đường nối Spring Boot. |
| Best Practices & Limitations | Slide 6; giới hạn của UI, URL, emulator và cloud. |
| Q&A | Slide 7; 7 câu hỏi dự kiến. |
| Reusable Source Code & Documentation | Slide 7 và các file bàn giao. |
