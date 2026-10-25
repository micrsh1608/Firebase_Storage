# Nghiệp vụ và API — đợt 3

## Danh tính và quyền

Tất cả API file/thư mục yêu cầu Firebase ID token qua Authorization: Bearer. Chủ sở hữu lấy từ claims đã xác minh; người nhận gắn UID từ Firebase Admin, không tin emailVerified hoặc UID client gửi trong body.

Chủ file đang hoạt động được tải/xem trước, đổi tên, di chuyển, cấp/thu hồi quyền và trash. Người nhận còn grant chỉ được xem/tải. Không được quản lý file/thư mục của người khác. Cloud yêu cầu email recipient đã xác minh; demo emulator miễn bước email thật.

Trash thu hồi toàn bộ grant, chặn tải/xem trước và giữ quota. Restore trả file về riêng tư tại thư mục cũ còn tồn tại, nếu vị trí bị mất thì về gốc. Purge chỉ áp dụng file trong thùng rác, giải phóng quota sau khi Storage xóa thành công. Lỗi xóa giữ trạng thái riêng tư để thử lại.

## Thư mục, tên và tìm kiếm

- Thư mục là metadata SQLite, không đổi raw Storage path. Không có quyền chia sẻ kế thừa từ thư mục.
- Tối đa 100 thư mục/tài khoản, 10 cấp; kiểm tra cả độ sâu nhánh con khi di chuyển.
- Tên 1–120 ký tự, chuẩn hóa NFC, không ký tự điều khiển hoặc dấu / và backslash. Sibling folders so sánh tên không phân biệt hoa/thường.
- Chỉ xóa thư mục rỗng, tính cả file trong thùng rác; không xóa đệ quy.
- File có name/fullPath làm ID ổn định, displayName làm tên người dùng nhìn thấy, folderId là vị trí. Đổi tên không chuyển đổi định dạng file.
- Tìm theo tên NFC/casefold, không tìm nội dung. Lọc/sắp xếp trước phân trang trên toàn bộ tập được cấp quyền.
- UI duyệt trực tiếp một thư mục khi không có từ khóa; có từ khóa tìm trong mọi thư mục của chủ file.
- Quota tính toàn bộ object, không phụ thuộc bộ lọc, thư mục hay trang.

## API danh sách và nội dung

| Endpoint | Kết quả |
|---|---|
| GET /api/files | files,nextPageToken,total,usage; mặc định all active |
| GET /api/files/trash | Toàn bộ tập trash được lọc, có trashedAt |
| GET /api/files/shared-with-me | Tập đã được cấp cho UID hiện tại, có ownerUid,ownerEmail,sharedAt |
| PUT /api/files?name=...&folderId=... | Raw body, 201 metadata; folderId bỏ trống là gốc |
| PATCH /api/files/{name} | JSON displayName và/hoặc folderId; null chuyển về gốc |
| GET /api/files/{name}/content | Download owner; attachment |
| GET /api/files/{name}/preview | Preview owner; inline + CSP sandbox |
| GET /api/files/shared/{ownerUid}/{name}/content | Download recipient còn quyền |
| GET /api/files/shared/{ownerUid}/{name}/preview | Preview recipient còn quyền |

List query: q tối đa 200 ký tự; type=all/pdf/image; sort=name/newest/oldest/size. Active list thêm scope=all/folder và folderId (bỏ trống cho root). Shared/trash tìm trên toàn tập. Cursor v3 gắn query/view/UID/folder; thay query phải bỏ pageToken.

Preview nhận đúng MIME PDF/JPEG/PNG/WebP, no-store/nosniff. UI fetch bằng Bearer rồi dựng PDF bằng PDF.js canvas hoặc ảnh bằng blob; không có public download token. Đóng modal hoặc đổi phiên hủy/dọn renderer/object URL.

## API thư mục

| Endpoint | Kết quả |
|---|---|
| GET /api/folders?parentId=... | {folders,breadcrumbs}; thiếu parentId là gốc |
| GET /api/folders?all=true | Toàn bộ thư mục của mình cho hộp di chuyển |
| POST /api/folders | JSON {name,parentId:null hoặc id}; 201 |
| PATCH /api/folders/{id} | JSON {name?,parentId?}; field bỏ qua giữ nguyên |
| DELETE /api/folders/{id} | 204 nếu rỗng |

Folder DTO: id,name,parentId,createdAt. Breadcrumb có id/name. Folder ID của tài khoản khác trả 404; chu kỳ hoặc vượt giới hạn trả 409. Body dư/không đúng định dạng bị từ chối.

## Chia sẻ và vòng đời (giữ đợt 2)

| Endpoint | Kết quả |
|---|---|
| GET /api/files/{name}/shares | Chủ file xem danh sách recipientUid,email,createdAt |
| POST /api/files/{name}/shares | JSON {email}; 201, tối đa 20 recipient; cấp lặp idempotent |
| DELETE /api/files/{name}/shares/{recipientUid} | 204 thu hồi |
| POST /api/files/{name}/trash | 204 soft delete và thu hồi mọi grant |
| POST /api/files/{name}/restore | 204, riêng tư |
| DELETE /api/files/{name} | 204 purge trash; active trả 409 |

Hạn mức: 10 MiB/file, 50 MiB và 200 file/tài khoản. Kiểm tra số byte thực và format cơ bản; lock bucket+owner bảo vệ quota và cập nhật quyền. Download đã được cho phép trước lúc revoke có thể hoàn tất; dữ liệu đã tải/xem không thể thu hồi.

## Khôi phục mật khẩu và dữ liệu

Quên mật khẩu dùng Firebase Auth SDK sendPasswordResetEmail. Giao diện trả kết quả chung cho email đã/chưa đăng ký. Integration dùng OOB của emulator để xác nhận mật khẩu cũ không còn dùng được và mật khẩu mới đăng nhập đúng UID; không ghi code/link vào mã nguồn hoặc log kiểm thử.

Metadata .data/FILESPACE_DATA_DIR cần giữ và sao lưu cùng bucket. Migration đợt 2 bổ sung cột/bảng trong transaction, không xóa grants/trash; file cũ ở gốc. Worker cùng server chia sẻ .data và thư mục khóa. Source ZIP không chứa metadata/credential người dùng.


## Xác minh email tự động (1.3.1)

Sau đăng ký, client tự gửi sendEmailVerification một lần. Khi người dùng mở link hợp lệ, trang hiện tại tự reload dữ liệu Auth và force-refresh ID token trước khi hiển thị đã xác minh. Polling 5 giây khi tab hiện; quay lại tab/online kiểm tra ngay; lỗi có backoff tối đa 30 giây; xác minh xong hoặc đăng xuất thì dừng. Gửi lại có cooldown 60 giây trong phiên trình duyệt; Firebase tiếp tục áp hạn mức phía dịch vụ. Không có nút xác nhận thủ công và không tự đánh dấu email đã xác minh khi chưa có bằng chứng từ Firebase.
