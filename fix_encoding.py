from pathlib import Path
from ftfy import fix_text

path = Path("frontend/ui.js")

original = path.read_text(encoding="utf-8")

# Sao lưu trước khi sửa
Path("frontend/ui.js.bak").write_text(
    original, encoding="utf-8"
)

fixed = fix_text(original)

path.write_text(fixed, encoding="utf-8")

print("Đã xử lý mã hóa tiếng Việt trong ui.js")