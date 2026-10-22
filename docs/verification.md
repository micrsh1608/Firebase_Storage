# Kiểm chứng bản tích hợp Student File Hub

Cập nhật tài liệu: **22/10/2026**. Báo cáo tách rõ **bản ghép TV1 + TV2** và **gói TV2 độc lập ngày 19/10/2026**. Không chuyển kết quả cũ thành bằng chứng của source sau khi ghép.

## Bản ghép TV1 + TV2 — đã kiểm chứng local ngày 22/10/2026

Môi trường kiểm chứng: Windows, FastAPI, Firebase Auth/Storage emulator thật, project `demo-firebase-storage`; browser Microsoft Edge headless dùng Firebase Web SDK thật. Không dùng project cloud, tài khoản cloud hoặc private key thật trong lần kiểm tra này.

| Tầng | Phép kiểm tra đã chạy | Kết quả |
|---|---|---|
| Python/API regression | `pytest`: 4 test nền tảng TV1 và các ca bổ sung về assets, lazy config và auth contract | **23/23 đạt** |
| File policy Node unit | MIME, biên byte, tên an toàn, ownership path | **4/4 đạt** |
| SDK + Rules thực | `npm run test:integration` trên Auth/Storage emulator đang chạy; upload/list/download/delete, A/B và guest | **6/6 đạt** theo Node runner: 5 nhóm và test cha |
| Browser E2E thực | Edge + FastAPI + Web SDK + emulators; Admin verifier thật xác minh token emulator | **Đạt**, không có JavaScript page error |
| Cloud | Project/bucket/credential/IAM/billing/CORS thật | **Chưa chạy** |

### API nền tảng và tích hợp đã xác nhận

- `/api/health` trả HTTP 200.
- `/api/project-status` trả mode `emulator`.
- `/api/storage-check` với cờ mặc định tắt trả `pending_blaze`; đây không phải phép thử bucket cloud thành công.
- `/setup` trả HTTP 200 và giữ dashboard Student File Hub của TV1.
- `/api/auth/me` không có Bearer token trả HTTP 401.
- Bộ Python regression kiểm tra frontend/assets, public config, lazy initialization và auth contract bên cạnh 4 test gốc. Những ca có mock xác nhận HTTP/config contract, không được ghi thành phép thử cloud.

### Browser với dịch vụ local thật đã xác nhận

- Tạo tài khoản, đăng nhập, đăng xuất và đăng nhập lại qua Firebase Authentication emulator.
- Upload PNG/PDF bằng `uploadBytesResumable`, xem danh sách và lấy download URL.
- Mở/tải URL trả đúng byte của tệp đã upload; URL vẫn dùng được sau sign-out khi tệp chưa bị xóa.
- Gọi `/api/auth/me` bằng ID token thật do Auth emulator cấp; Firebase Admin verifier xác minh và UID khớp giao diện.
- Xóa tệp qua UI, danh sách cập nhật; file ngoài loại cho phép bị UI từ chối.
- Không có page error và không tràn ngang tại desktop **1440 × 1500**, mobile **390 × 844**.

Ảnh chụp phiên QA **bản ghép 22/10/2026**, dùng dữ liệu giả và ẩn download token: [desktop](demo-desktop.png), [mobile](demo-mobile.png).

Lệnh tái sử dụng từ thư mục gốc:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
npm run test:policy
npm run test:emulators
```

`test:emulators` tự mở emulator; dừng phiên đang chạy trước để tránh trùng cổng. API unit tests dùng mock không thay cho browser/API với Admin verifier thật hoặc phép thử cloud. Xem [README](../README.md) và [checklist bàn giao](team-handoff.md).

## Bằng chứng lịch sử — gói TV2 độc lập 19/10/2026

Các kết quả sau được giữ từ báo cáo của gói `newseminar` trước khi ghép vào Student File Hub. Môi trường được ghi nhận: Windows, Node 24.22.0, Python 3.12, JDK 25.0.2, Firebase CLI 15.34.0, Firebase JS SDK 13.0.0, project `demo-firebase-storage`; không dùng tài khoản Firebase cloud hoặc service-account thật.

| Tầng của gói độc lập | Kết quả đã ghi nhận |
|---|---|
| API/config unit, verifier/startup có mock | 12/12 đạt |
| File policy Node unit | 4/4 đạt |
| SDK + Rules emulator thật | 6/6 theo Node runner: 5 nhóm và test cha |
| Edge headless với FastAPI + Auth/Storage emulator + SDK CDN | Các luồng bên dưới đạt, không có page error |
| Browser module giả lập | UI thao tác/async, đổi user khi URL chưa xong, báo lỗi tải SDK đạt |

### Những thao tác gói độc lập đã xác nhận

- Đăng ký tự đăng nhập; logout/login lại cùng UID; lấy ID token qua SDK.
- Upload PNG/PDF, metadata đúng; list 21 object thành hai trang 20 + 1 không trùng/mất.
- Download URL trả đúng byte PNG, kể cả sau logout và không gửi Authorization header.
- Guest/B bị Rules từ chối metadata/list/upload/delete trong prefix A.
- Chặn MIME sai, file rỗng, file >5 MiB; chặn overwrite nội dung và sửa metadata; byte/generation/hash/type/size object gốc không đổi.
- Owner xóa được; đọc/lấy URL qua SDK sau xóa báo object không còn.
- UI register → upload PNG/PDF → refresh → get URL → tải đúng byte → gọi `/api/auth/me` bằng Admin verifier thật với token emulator (`check_revoked=True`) → logout/login → từ chối `.txt` → xóa.
- Không tràn ngang ở desktop 1440 × 1500 và mobile 390 × 844.

Các ảnh đang liên kết trong báo cáo là ảnh bản ghép ngày 22/10; phần lịch sử này chỉ giữ mô tả kết quả gói độc lập, không dùng ảnh mới làm bằng chứng cho lần chạy cũ.

## Giới hạn cần giữ khi báo cáo

- **Chưa kiểm chứng trực tiếp Firebase cloud** trong công việc tích hợp này: billing, bucket thật, credential/IAM, authorized origin/CORS, App Check, retention/soft delete cần chạy riêng.
- Không có antivirus, kiểm tra magic bytes hoặc authorization theo thực thể nghiệp vụ. MIME/kích thước là kiểm tra metadata, không chứng minh file an toàn.
- Emulator không mô phỏng mọi cấu hình cloud, hiệu năng production, mất mạng hay mọi browser.
- Các con số test lịch sử chỉ áp dụng source độc lập tại thời điểm đã chạy. Các kết quả bản ghép ở mục trên là những phép kiểm tra đã chạy lại ngày 22/10; chúng vẫn không xác nhận Firebase cloud.

Tài liệu tham khảo về giới hạn emulator: [Firebase Storage emulator](https://firebase.google.com/docs/emulator-suite/connect_storage).
