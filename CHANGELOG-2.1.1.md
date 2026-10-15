# Nếp 2.1.1 — Sửa lỗi thẻ nội dung bị cắt ngang

- Sửa giới hạn chiều rộng bên trong thẻ bài đăng; bỏ grid track tự giãn theo nội dung dài.
- Tên sản phẩm xuống dòng, trạng thái có hàng riêng.
- Ô nội dung và ô chọn ảnh luôn nằm trong thẻ; link dài được ngắt dòng.
- Số cột theo chiều rộng vùng chứa, tăng cỡ chữ ở điện thoại.
- Không đổi database hoặc biến môi trường.

Cập nhật source hoặc chỉ thay app/studio.css rồi redeploy Vercel. Nếu bản cũ còn trong tab đang mở, tải lại trang sau khi deployment hoàn tất.

Đã chạy production build và TypeScript. Chưa kiểm chứng bằng browser tự động hoặc truy cập deployment Vercel của bạn.
