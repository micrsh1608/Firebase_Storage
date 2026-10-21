# Bước B – FastAPI (làm ngay trên Windows)

## Điều kiện
Python 3.11+ và VS Code. Chạy lệnh `py --version`.

## Cài và chạy
```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```
Thay FIREBASE_PROJECT_ID trong .env và giữ STORAGE_ENABLED=false.

Mở:
- http://127.0.0.1:8000 – giao diện mẫu
- http://127.0.0.1:8000/docs – Swagger
- http://127.0.0.1:8000/api/health – JSON status ok
- http://127.0.0.1:8000/api/project-status – trạng thái project
- http://127.0.0.1:8000/api/storage-check – pending_blaze

## Giải thích code
- `app/main.py` tạo FastAPI, định nghĩa đường dẫn (route), trả JSON.
- `app/firebase_client.py` chuẩn bị cấu hình Admin SDK nhưng chưa tự kết nối
  đến Firebase khi STORAGE_ENABLED=false.
- `frontend/index.html` là giao diện demo kiểm tra API, chưa phải CRUD app.

## Lỗi thường gặp
- `py is not recognized`: cần cài Python và bật Python launcher; hoặc thử
  `python -m venv .venv`.
- `No module named fastapi`: đảm bảo dùng đúng Python trong `.venv`.
- Cổng 8000 đã dùng: chạy `... -m uvicorn app.main:app --reload --port 8001`.
- Không chạy được Activate.ps1: dự án KHÔNG cần activate; các lệnh đều gọi
  `.venv\Scripts\python.exe` trực tiếp.
- `/api/storage-check` hiện pending_blaze: ĐÚNG, vì ta chưa nâng cấp.

## Test tự động
```powershell
.\.venv\Scripts\python.exe -m pytest -q
```
