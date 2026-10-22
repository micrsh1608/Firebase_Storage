# Bàn giao nhóm — Student File Hub, phần 2

Bản tích hợp TV1 + TV2 ngày **22/10/2026**. Cách chạy hiện tại ở [README](../README.md), thay đổi khi ghép ở [member2-integration.md](member2-integration.md), bằng chứng kiểm thử ở [verification.md](verification.md). Checklist bên dưới là việc cần diễn tập; không coi ô kỳ vọng là kết quả đã chạy.

## Trách nhiệm sau tích hợp

| Thành viên | Phạm vi giữ/bàn giao |
|---|---|
| TV1 — Setup & Architecture | Project/bucket cloud, FastAPI, `app/firebase_client.py`, API health/status/storage-check, dashboard `/setup`, setup và kiến trúc |
| TV2 — Authentication & File Operations | Auth Email/Password; upload/list/get URL/delete bằng Web SDK; UI `/`; `/api/demo-config`, `/api/auth/me`; tài liệu reuse và kịch bản trình bày |
| TV3 — Security, Integration & Testing | Rà soát Rules cuối cùng, A/B authorization tests, bảo mật API Admin, Spring Boot và Best Practices & Limitations |

Baseline `storage.rules` và test emulator hỗ trợ TV2 chạy local. TV3 phải rà soát policy trước khi nhóm dùng cloud; sự hiện diện của file Rules không phải bằng chứng production đã an toàn. Bản ghép không tự deploy Rules hoặc thay đổi project cloud.

## Hợp đồng cần giữ

| Điểm ghép | Hợp đồng |
|---|---|
| Origin | `http://127.0.0.1:8000`; `/` là UI TV2, `/setup` là dashboard TV1, `/static` phục vụ assets |
| Local | Project `demo-firebase-storage`; Auth 9099, Storage 9199; client/CLI/Admin verifier cùng project |
| Config | `/api/demo-config` → `{mode, projectId, bucket, firebaseConfig}`; chỉ dữ liệu Web công khai |
| Backend auth | `/api/auth/me` nhận `Authorization: Bearer <Firebase ID token>`; trả danh tính sau verify, không echo token |
| Admin getter | Khởi tạo khi endpoint auth cần dùng; public/static không cần private key. Thiếu ADC/dịch vụ xác minh trả 503 |
| Storage TV1 | `STORAGE_ENABLED` điều khiển `/api/storage-check`, không điều khiển Web SDK CRUD của TV2 |
| Phiên | `browserSessionPersistence`, observer Auth cập nhật UI; không tự ghi password/token vào localStorage |
| Object path | `users/{uid}/{uuid}-{sanitizedName}`; UID từ Auth user, không từ input tự khai |
| Loại/kích thước | JPEG, PNG, WebP, PDF; `0 < size <= 5 * 1024 * 1024` byte |
| List | Prefix đúng UID, 20 mục/trang, page token; Rules version 2 và quyền list phù hợp |
| URL | Download token khác ID token; URL chia sẻ không tự hết hiệu lực khi logout |
| Xóa | Dùng object path/reference, tải lại danh sách; demo không có chức năng restore |
| Bảo mật hiển thị | Không log/show ID token, password, private key; không đưa download URL nhạy cảm vào ảnh demo |

## Trình tự giải thích trước lớp

1. Auth Web SDK tạo phiên và cung cấp UID; đăng ký thành công tự đăng nhập.
2. Browser truyền tệp trực tiếp tới Storage. Client SDK mang danh tính; Storage Rules kiểm tra prefix, size và MIME metadata.
3. `ref` là tham chiếu object; upload mới truyền byte. List trả reference/metadata, `getDownloadURL` cấp liên kết chia sẻ khi người dùng chủ động yêu cầu.
4. Gọi API riêng cần Bearer ID token; FastAPI xác minh rồi lấy UID tin cậy. Không tin UID trong body thay cho UID từ token.
5. Admin SDK trên server có đặc quyền riêng; API thao tác file phải tự kiểm tra authorization.
6. Spring Boot giữ hợp đồng Bearer ID token/object path; TV3 bổ sung Admin SDK Java/filter và quyền nghiệp vụ. Phần 2 chưa có Spring Boot app.

## Cần TV1 xác nhận trước demo cloud

- Project `student-file-hub-seminar-7a7f2`; đối chiếu bucket thật với `student-file-hub-seminar-7a7f2.firebasestorage.app`.
- Web app/config, Email/Password, billing và quyền service account/ADC phù hợp.
- `DEMO_MODE=cloud`, đủ Web env fields, không còn các biến emulator; restart backend sau khi đổi.
- Public config/static mở được; `/api/auth/me` xác minh token cloud; `/api/storage-check` kiểm tra Admin Storage riêng khi bật cờ.
- Key backend chỉ nằm trên máy được phép; `.env` và service-account JSON không đi theo source/slide.

## Cần TV3 rà soát

- User chỉ read/list/delete prefix của mình; guest và B không đọc được prefix A qua SDK thực tế.
- Biên kích thước 5.242.880 byte được nhận; 5.242.881 byte và file rỗng bị chặn.
- `create` có `resource == null` để chặn ghi đè nội dung; `update: if false` chặn sửa metadata. Delete không bị gộp với điều kiện `request.resource` của upload.
- MIME chỉ là metadata; kiểm tra nội dung/malware và authorization theo lớp học/dự án là thiết kế bổ sung.
- Giữ hoặc thay `check_revoked=True` có chủ đích; backend cần credential/quyền truy vấn Auth phù hợp.
- Download URL dài hạn là quyền qua liên kết. Thử “logout nhưng URL còn mở” không đủ để kết luận Rules lỗi; thiết kế thu hồi/link hết hạn riêng nếu cần.
- Cloud có CORS, App Check, IAM, retention/soft delete và billing riêng; emulator không kiểm chứng những cấu hình đó.

## Checklist diễn tập nhóm

| Nhóm | Thao tác cần chạy lại | Kỳ vọng |
|---|---|---|
| Nền tảng | `/`, `/setup`, `/docs`, API health/status và assets | Hai giao diện và API được giữ hoạt động |
| Auth | Register, logout, login đúng/sai, reload tab | UID đúng, lỗi dễ hiểu, không lộ token/password |
| API | `/api/auth/me` hợp lệ/thiếu/sai token | UID khớp hoặc bị từ chối; lỗi dịch vụ được phân biệt |
| Upload | Ảnh/PDF hợp lệ, trùng tên, hủy giữa chừng | UUID tách object, tiến trình/cancel hoạt động |
| List | Hơn 20 tệp | Trang 20 + phần còn lại, không trộn user |
| URL | Get URL, mở/tải, ẩn trong lúc đang lấy URL, request URL liên tiếp | Đúng tệp, không bật lại URL cũ; hiểu link chia sẻ |
| Xóa | Xóa tệp rồi làm mới | Không còn trong danh sách; lỗi refresh không bị thông báo thành công che mất |
| Async | Logout/đổi user khi upload/list/URL đang chạy | Dọn nội dung và bỏ kết quả thuộc phiên cũ |
| Rules | B/guest gọi SDK vào prefix A; file sai loại/size; overwrite/metadata update | Bị Rules từ chối theo policy |
| Cloud | Chạy lại toàn bộ với project thật | Ghi kết quả riêng; không suy từ emulator |

Sau khi chạy, ghi ngày/môi trường/lệnh và kết quả vào `verification.md`. Dùng dữ liệu demo giả, không chụp header Bearer hoặc download token. Tài liệu TV1 `docs/setup.md` và `01_...` đến `06_...` được giữ để tham khảo; cách chạy bản ghép theo README mới.
