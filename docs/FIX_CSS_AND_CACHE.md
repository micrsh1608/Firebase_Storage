# Sửa lỗi FileSpace giao diện vỡ / icon cực lớn

## Nguyên nhân

Screenshot cho thấy trình duyệt đang hiển thị HTML nhưng thiếu CSS của `frontend/styles.css`, hoặc vẫn dùng CSS cũ. Các SVG `<use>` chưa có `.icon{width:19px;height:19px...}` nên tràn kích thước. Điều này không liên quan trực tiếp đến Firebase.

## Cài bản sửa lên dự án đang chạy

1. Dừng FastAPI (`Ctrl+C` trong Terminal).
2. Sao lưu project đang chạy. **Giữ nguyên `.env` và `secrets/serviceAccountKey.json` đang có trên máy.**
3. Chép đè **cả 3 file** `frontend/index.html`, `frontend/styles.css`, `frontend/ui.js` trong bộ sửa lên đúng thư mục `frontend/` của project đang được mở trong VS Code. Chỉ chép một file HTML mà quên CSS sẽ tiếp tục xảy ra lỗi.
4. Nếu muốn tắt cache cho toàn bộ HTML/CSS/JS khi demo, chép đè thêm `app/main.py` (đã giữ nguyên các endpoint). Nếu không chép `app/main.py` thì phiên bản asset mới với `?v=...` vẫn giúp trình duyệt lấy lại CSS/JS.
5. Tại thư mục gốc project, chạy lại:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
   ```

6. Mở `http://127.0.0.1:8000/static/styles.css?v=filespace-20261022-2`. Phải thấy **nội dung CSS**, không phải trang 404, 500 hoặc HTML.
7. Mở `http://127.0.0.1:8000/static/ui.js?v=filespace-20261022-2`. Phải thấy **mã JavaScript**.
8. Mở `http://127.0.0.1:8000/` rồi nhấn `Ctrl+Shift+R` để tải mới.

## Nếu vẫn vỡ bố cục

- Nhấn `F12` → tab `Network` → bật `Disable cache` → tải lại.
- Tìm `styles.css` trong danh sách và kiểm tra `Status`: phải là `200`; loại trả về phải là `text/css`.
- Nếu 404, rất có thể bạn đang chạy Uvicorn từ project khác với project vừa chép file. Dừng mọi instance Uvicorn, mở Terminal đúng thư mục gốc, chạy lại.
- Nếu CSS báo 200 nhưng icon còn lớn, mở tab `Elements` chọn một `.icon` và xem `Computed` → `width/height` phải ~19px. Nếu không phải, trình duyệt có thể đang nạp CSS cũ hoặc extension can thiệp.
- Cấu hình Firebase bị thiếu sẽ ảnh hưởng đăng nhập/upload nhưng **không** làm CSS biến mất.

## Tài nguyên bí mật

Bản sửa không chứa `.env`, Service Account JSON hoặc Firebase credentials. Không xóa các file cấu hình riêng khỏi máy bạn nhưng cũng không push chúng lên GitHub.
