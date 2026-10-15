# Nếp 2.2 — Instagram Login trực tiếp

Đọc phần đầu **HUONG-DAN-META.md** để dùng Instagram App ID/Secret với nút Kết nối Instagram tại https://nep-hp.vercel.app. Chạy thêm supabase/instagram-oauth.sql. Token được mã hóa, giữ riêng phía server; không cần lấy token thủ công trong Explorer.

# Nếp 2.1 — Nội dung ngắn và ba kênh Meta

Source được sửa từ nep.zip người dùng cung cấp. Next.js App Router + Supabase, chạy server trên Vercel.

Đọc **HUONG-DAN-META.md** trước để cập nhật SQL và cài Instagram/Threads. Hướng dẫn cũng nằm trên website tại `/HUONG-DAN-META.html`.

- Giữ Facebook Page đã hoạt động, thêm ảnh tùy chọn.
- Threads: chữ hoặc một ảnh, user token riêng.
- Instagram API with Facebook Login: tài khoản Professional liên kết Fanpage, một ảnh Feed với caption.
- WebP lưu trong private Storage. Server cấp ảnh JPEG 1080×1080 qua link ký hiệu lực một giờ; không lưu thêm JPEG vào bucket.
- Bài ngắn mặc định, câu mở đầu tối đa 70 ký tự, ba góc viết. Không tự sửa bài cũ.
- Chọn Gemini/Claude/OpenAI và Model ID; một provider/lượt, không tự fallback.
- Giao diện responsive chia bước, chọn kênh/ảnh, xem trước, lọc bản nháp/lịch sử và duyệt từng bài.

## Cập nhật

Chạy `supabase/social-v2.sql` sau các schema/content SQL đã có. Thêm PUBLIC_SITE_URL, INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN, THREADS_USER_ID và THREADS_ACCESS_TOKEN theo hướng dẫn. Giữ khóa Facebook đã hoạt động. Redeploy sau khi đổi biến.

Bản cài mới: chạy schema.sql, content.sql, site-settings.sql rồi social-v2.sql. Tạo tài khoản Supabase Auth, đặt UUID vào CONTENT_ADMIN_USER_ID, điền khóa server trong Vercel. Không tắt RLS hoặc đưa service-role key vào frontend.

## Chạy và kiểm tra

Node.js 22.x (runtime hỗ trợ TypeScript stripping để chạy tests TS trực tiếp).

```sh
npm ci
npm run dev
npm run typecheck
node --test tests/*.test.mjs
npm run build
```

Không dùng static export hoặc Output Directory=out. Giữ Next.js preset và output mặc định trên Vercel. scripts/build.mjs chỉ bỏ qua đo RSS tùy chọn khi hệ điều hành không cung cấp syscall tương ứng; biên dịch/typecheck vẫn chạy.

Chưa thử đăng Instagram/Threads bằng token thật, chưa browser QA trong môi trường bàn giao. Các nút kiểm tra tài khoản chỉ đọc dữ liệu, không tạo bài. Đọc hướng dẫn xử lý trạng thái unknown trước khi retry.

Bản 2.1 thêm 5 model chữ Google trong yêu cầu và tạo ảnh sản phẩm với Nano Banana 2 Lite; xem phần 8 của HUONG-DAN-META.md.
