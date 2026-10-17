> **2.10.1:** đồng nhất lề các khối quản trị, sửa chỗ thò ra/thụt vào trong Nội dung AI. Xem `UI-ALIGNMENT-2.10.1.md`. Nâng từ 2.10.0 không cần SQL mới.

> **Cập nhật 2.10.0 — vị trí link theo nền tảng.** Chạy `supabase/affiliate-placement.sql` sau `reels.sql`, deploy rồi kết nối lại Facebook để cấp `pages_manage_engagement`. Facebook: link ở bình luận (ghim thủ công); Instagram: CTA dẫn lên Bio đã đặt link; Threads: link cuối bài. Bài đã đăng không bị đăng lại khi bình luận lỗi. Đọc `AFFILIATE-PLACEMENT-2.10.md` trước khi bật lại lịch.

# Nếp 2.9.1 — sửa lỗi cron gọi AI và tạm dừng

Đọc **CRON-AI-FIX-2.9.1.md**. Chỉ viết kênh cần đăng, chờ AI tối đa 60 giây, sửa đúng bản dài một lần, retry lỗi tạm thời có backoff/Retry-After. 503/timeout/chưa đạt nội dung bỏ qua lượt và giữ lịch cho giờ kế tiếp; sai khóa/model hoặc Meta chưa rõ kết quả vẫn dừng. Nếu đã cài đầy đủ 2.9 thì không cần SQL mới hoặc cài lại cron. Lịch tắt do lỗi cũ cần bật/lưu lại một lần sau deploy.

# Nếp 2.9 — thêm Reel và video sản phẩm

Đọc **REELS-2.9.md** để nâng cấp: chạy `supabase/reels.sql` sau `automation-unrestricted.sql`, rồi deploy source mới. Bản này thêm video riêng tư theo sản phẩm, viết mô tả và đăng Reel Facebook/Instagram; lịch chọn Bài thường/Reel/Trộn và định dạng riêng theo giờ. Từ 2.10: Facebook đặt link ở bình luận, Instagram dẫn lên Bio; **không tự gắn thẻ giỏ hàng Shopee**. Threads vẫn dùng bài thường. Lịch cũ được giữ dạng bài thường.

# Nếp 2.8 — tự viết, tự đăng theo lịch, không giới hạn sáng/tối

Bản 2.8 thay thế các giới hạn được mô tả trong ghi chú phiên bản cũ phía dưới. Đọc **HUONG-DAN-TU-DONG.md** để nâng cấp: chạy `supabase/automation-unrestricted.sql`, rồi chạy lại `supabase/automation-schedule.sql`, và deploy source mới. Giữ nguyên khóa và dữ liệu.

- Bỏ giới hạn mỗi sản phẩm một lần sáng/một lần tối, trần lượt lịch mỗi ngày và trần 30 lượt AI/24h của ứng dụng.
- Mặc định tự động: Gemini `gemini-3.5-flash-lite`, Siêu ngắn, góc viết nêu một phiền toái cụ thể. Có mẫu lịch Mỗi 2 giờ (12 mốc/ngày); giữ nguyên lịch đã lưu cho đến khi bạn đổi.
- AI tự động: tối đa 5 lần gọi tổng cộng, chờ khoảng 10 giây sau mỗi lần lỗi, giữ nguyên nhà cung cấp/model. Mỗi yêu cầu tối đa 30 giây, cả cron tối đa 300 giây. Không thử lại bước gửi bài sang Meta.
- Hạn mức thực tế của Instagram/Threads đọc từ Meta; Facebook xử lý theo phản hồi API. Không cam kết miễn phí hoặc số bài không giới hạn từ nhà cung cấp.
- Giữ khóa đăng nhập, RLS, xác thực admin, khóa một lượt AI đang chạy, chống nhận trùng khung giờ và chống gửi lại cùng bài.

# Nếp 2.3 — OAuth Fanpage, Instagram, Threads

Đọc phần đầu HUONG-DAN-META.md. Chạy thêm social-oauth.sql cho Facebook/Threads; giữ instagram-oauth.sql cho Instagram. Các nút kết nối nằm trong Thiết lập. Facebook có bước chọn Page rõ ràng. Token lưu mã hóa phía server; không cần lấy access token thủ công.

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
