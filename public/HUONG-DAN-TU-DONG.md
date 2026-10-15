# Nếp 2.4 — tự tạo và đăng bài mỗi giờ

Trang quản trị mới sau khi deploy: https://nep-hp.vercel.app/automation/

## Cài đặt lần đầu

1. Upload bản nguồn 2.4 lên repository/project Vercel bạn đang dùng. Giữ nguyên các biến môi trường của bản 2.3.
2. Mở Supabase → SQL Editor. Chạy `supabase/automation.sql` (cũng có trong `public/automation.sql`). Cần có `content.sql` và `social-v2.sql` từ bản cũ; không xóa dữ liệu cũ.
3. Tạo chuỗi ngẫu nhiên tối thiểu 32 ký tự. Có thể dùng trình quản lý mật khẩu hoặc lệnh Node trên máy mình: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Vercel → Project → Settings → Environment Variables: thêm `CRON_SECRET`, giá trị là chuỗi vừa tạo, phạm vi Production. Redeploy để server nhận biến mới. Không dùng tiền tố NEXT_PUBLIC_.
5. Supabase Dashboard → Vault: tạo secret tên chính xác `nep_cron_secret`, giá trị giống hệt `CRON_SECRET`. Nếu đã có, cập nhật bản hiện tại, tránh tạo nhiều secret cùng tên. Không gửi secret vào chat hay commit vào Git.
6. Supabase → Database → Extensions: bật `pg_cron`, `pg_net` nếu chưa có. Trong SQL Editor chạy `supabase/automation-schedule.sql`. Script cũng có lệnh tạo extensions nếu tài khoản có quyền. Lịch có tên `nep-hourly-publish`, gọi POST `https://nep-hp.vercel.app/api/automation/cron/` lúc phút 00 mỗi giờ. Nếu đổi tên miền, sửa URL trong script rồi chạy lại.
7. Trở lại trang quản trị → sản phẩm: đặt các sản phẩm muốn dùng thành **Sẵn sàng**, có tên, mô tả, link affiliate HTTPS, đánh dấu **Tôi đã kiểm tra thông tin nguồn**. Instagram cần ít nhất một ảnh đã lưu.
8. Mở `/automation/`, đăng nhập qua trang quản trị nếu chưa đăng nhập. Chọn các kênh đã kết nối, AI/model, độ dài, hạn mức 1–24 lượt/ngày. Chọn bật lịch, tick cho phép tự đăng, bấm **Lưu cấu hình**. Khi bật, server xác nhận và lưu ID tài khoản đích hiện tại.
9. Sau giờ tiếp theo, bấm **Làm mới** để xem lịch sử. Không cần giữ trình duyệt mở.

## Hoạt động

- Một lượt mỗi giờ tạo **một bài cho một kênh**, chọn ngẫu nhiên sản phẩm/kênh/ảnh/góc viết trong tập hợp đủ điều kiện. Không đăng đồng thời lên tất cả các kênh. Tránh lặp sản phẩm của lượt thành công ngay trước nếu có sản phẩm khác.
- Hạn mức ngày tính theo giờ Việt Nam, bao gồm lượt lỗi/bỏ qua đã được nhận. Cùng một giờ không nhận lượt thứ hai dù gọi endpoint nhiều lần. Không chạy bù giờ cũ.
- Tổng AI thủ công và tự động vẫn giới hạn 30 lượt/24 giờ. Mỗi lượt gọi một nhà cung cấp, không retry hoặc chuyển sang nhà cung cấp trả phí khác. Gemini không mặc nhiên miễn phí: phụ thuộc model, hạn mức và tài khoản Google.
- Không tự tạo ảnh mới; dùng ảnh sản phẩm đã lưu WebP, tạo URL JPEG tạm cho Meta như bản 2.3.
- AI nhận dữ kiện sản phẩm, tự rà soát, rồi server kiểm tra cấu trúc, độ dài, mở bài, link và thông báo hoa hồng. Đây không phải bảo đảm bài luôn hay hoặc mọi khẳng định đều đúng; cần nhập nguồn đã kiểm tra và xem các bài đầu để điều chỉnh.
- Lưu bản nháp trước khi đăng. Lịch cho phép bỏ bước duyệt từng bài theo cấu hình bạn đã xác nhận. Nội dung thủ công vẫn dùng luồng duyệt cũ.
- Nếu sửa/tắt lịch trong lúc AI đang viết, server kiểm tra lại trước khi gửi. Bài đã gửi Meta vẫn có thể hoàn tất.
- Đổi kết nối/tài khoản đích: lịch dừng thay vì âm thầm đăng sang tài khoản khác. Lưu lại cấu hình để xác nhận ID mới.
- Lỗi làm lịch tắt; trạng thái Meta không rõ thì không tự gửi lại bài. Xem nội dung trong quản trị và trên nền tảng trước khi bật lại. Nếu tiến trình bị nền tảng ngắt, lượt tiếp theo ghi nhận và dừng để kiểm tra. Bài `publishing`/`unknown` không được gửi lại tự động.
- Endpoint giới hạn 120 giây, AI tối đa 60 giây; còn dưới khoảng 25 giây trước bước publish thì giữ nháp. Không thể đọc chính xác token quota còn lại từ mọi nhà cung cấp; ghi lại token mà API trả và dừng khi API báo lỗi/hết quota.
- Phiên bản này hỗ trợ tối đa 1.000 sản phẩm sẵn sàng, 12.000 ảnh trong tài khoản; vượt giới hạn sẽ dừng thay vì chọn từ danh sách bị cắt.

## Kiểm tra khi chưa thấy bài

1. Trang `/automation/` báo đang bật, đã có CRON_SECRET, tài khoản có đúng `CONTENT_ADMIN_USER_ID` không?
2. Supabase → Cron → job `nep-hourly-publish` đang active? Mục Job runs chỉ chứng minh lệnh HTTP đã được xếp hàng, chưa chứng minh Meta đăng thành công.
3. Xem lịch sử trên `/automation/` và logs Vercel theo `/api/automation/cron/`. Đừng chụp secret/headers khi gửi lỗi.
4. Có thể kiểm tra mã HTTP gần nhất bằng SQL (không đọc header chứa khóa):

```sql
select id, status_code, error_msg, created
from net._http_response
order by created desc limit 10;
```

- 401: CRON_SECRET và secret Vault không khớp hoặc redeploy chưa nhận biến.
- 404/redirect: URL cron phải kết thúc `/` như script, miền đúng production.
- 400: thiếu migration/biến môi trường; xem message trong phản hồi/log.
- HTTP 200 có `status: failed` vẫn có nghĩa lượt đăng thất bại: đọc lịch sử ứng dụng.
- Không có sản phẩm phù hợp: bổ sung nguồn, trạng thái, mô tả/link; thêm ảnh cho Instagram.
- Google báo quota/tên model: kiểm tra tài khoản AI Studio và model có thể dùng. Sửa model trên trang lịch, lưu và bật lại.
- Meta lỗi: kiểm tra token còn hạn, quyền đăng, tài khoản đang kết nối; xem Meta trước khi thử thủ công.
- Supabase bị pause, cron ngừng hoặc website không truy cập được: lịch không thể chạy; không có bảo đảm thời gian tuyệt đối.

## Tắt lịch

Bấm **Tắt lịch ngay** trên `/automation/`. Scheduler vẫn gọi endpoint nhưng không tạo/đăng bài. Để bỏ cả scheduler:

```sql
select cron.unschedule('nep-hourly-publish');
```

Muốn cài lại, chạy lại `automation-schedule.sql`; dùng cùng tên sẽ cập nhật job.

Vercel Hobby chỉ hỗ trợ Vercel Cron mỗi ngày. Bản này dùng Supabase Cron + pg_net nên không thêm lịch mỗi giờ vào vercel.json. Nếu project bị Vercel Deployment Protection chặn bên ngoài, cần cấu hình cho endpoint được scheduler truy cập; không đưa khóa vào URL công khai.

Tài liệu chính thức:
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://vercel.com/docs/cron-jobs/usage-and-pricing
