# Nếp 2.10.2 — CTA dẫn đến sản phẩm

Nội dung do hệ thống tạo không còn tự thêm “Link affiliate · mình có thể nhận hoa hồng.” hoặc câu thông báo cũ dài hơn.

| Vị trí | Câu dùng mặc định |
| --- | --- |
| Cuối bài/Reel Facebook | Link săn deal mình ghim ở bình luận đầu tiên nha 👇 |
| Bình luận Facebook | Link sản phẩm ở đây nha 🛒 + xuống dòng + link gốc |
| Cuối caption/Reel Instagram | Link sản phẩm mình để trên Bio nha 🛒 |
| Cuối bài Threads | Link sản phẩm ở đây nha 🛒 + xuống dòng + link gốc |

Facebook/Instagram tiếp tục không chứa URL trong phần bài/caption. Threads và bình luận Facebook giữ nguyên URL sản phẩm, không thay mã affiliate. Cơ chế đăng bình luận, trạng thái lỗi và chống gửi trùng giữ nguyên.

Hệ thống gỡ đúng các footer/CTA cũ được nhận diện khi chuẩn bị, lưu hoặc đăng bản nháp, rồi ghép một CTA theo kênh. Ghép lại nhiều lần không tạo thêm câu lặp. Không xóa từ “hoa hồng” trong mô tả sản phẩm, chẳng hạn sữa rửa mặt hương hoa hồng.

Thao tác ghim bình luận Facebook và đặt link Bio Instagram vẫn do quản trị viên thực hiện. Câu dẫn Bio không khẳng định sản phẩm chính hãng khi chưa có dữ kiện nguồn.

## Cập nhật

Deploy source mới lên Vercel, sau đó tải lại Nội dung AI để bản nháp dùng câu dẫn mới. Nếu đã chạy SQL của 2.10.0 thì không cần SQL mới, đổi API key hoặc cài lại cron. Các bài đã xuất bản giữ lịch sử gốc; thay đổi áp dụng khi chuẩn bị và xuất bản nội dung từ phiên bản này.
