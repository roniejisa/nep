# Nếp 2.9.1 — sửa lỗi cron gọi AI và tạm dừng

Đọc **CRON-AI-FIX-2.9.1.md**. Chỉ viết kênh cần đăng, chờ AI tối đa 60 giây, sửa đúng bản dài một lần, retry lỗi tạm thời có backoff/Retry-After. 503/timeout/chưa đạt nội dung bỏ qua lượt và giữ lịch cho giờ kế tiếp; sai khóa/model hoặc Meta chưa rõ kết quả vẫn dừng. Nếu đã cài đầy đủ 2.9 thì không cần SQL mới hoặc cài lại cron. Lịch tắt do lỗi cũ cần bật/lưu lại một lần sau deploy.

# Cập nhật source Nếp 2.9 lên Vercel

1. Đã dùng 2.8: chạy `supabase/reels.sql` trong Supabase SQL Editor. Nếu chưa nâng 2.8, chạy `automation-unrestricted.sql` sau các migration cũ và cài lịch theo `AUTOMATION-2.8.md` trước.
2. Chép nội dung thư mục `nep/` từ ZIP vào gốc repository (nơi có package.json), không tạo thư mục nep lồng nhau.
3. Xóa hai file cũ nếu còn: `app/automation/page.tsx` và `app/categories/page.tsx`. Giữ bản trong `app/(admin)/` và giữ nguyên `app/api/automation`.
4. Commit/push để Vercel deploy. Giữ các biến môi trường và Fluid Compute 300 giây. Bản 2.9 không cần khóa mới riêng cho Reel.
5. Vào Nội dung AI, chọn sản phẩm, tải video MP4 rồi chọn Reel để thử thủ công. Sau đó chọn định dạng chung hoặc theo từng giờ ở Lịch tự đăng, xác nhận và lưu.

Reel dùng video chuẩn bị sẵn, AI viết mô tả. Link affiliate nằm trong mô tả, **chưa tự gắn thẻ sản phẩm/giỏ hàng Shopee**. Đọc `REELS-2.9.md` để biết thông số video, cách dùng và giới hạn API.

Không xóa khóa/token hoặc dữ liệu đang có. Nếu cron bản 2.8 đã cài thì không cần cài lại cron.
