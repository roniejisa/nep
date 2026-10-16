# Nếp 2.8 — Tự viết, tự đăng theo giờ đã chọn

## Nâng cấp bản hiện tại

1. Trong Supabase → SQL Editor, chạy toàn bộ `supabase/automation-unrestricted.sql` trong ZIP, sau `automation-times.sql` và các migration cũ. **Bắt buộc chạy SQL này** để bỏ trigger và giới hạn cũ; chỉ deploy code là chưa đủ.
2. Chép nội dung thư mục `nep/` vào gốc repository rồi deploy Vercel. Giữ các biến môi trường hiện có. Xóa hai file cũ `app/automation/page.tsx` và `app/categories/page.tsx` nếu còn; giữ các trang tương ứng trong `app/(admin)/` và giữ `app/api/automation`.
3. Bảo đảm dự án Vercel dùng Fluid Compute, hỗ trợ function chạy 300 giây. Source đã đặt `maxDuration=300` cho cron, tạo bài và đăng bài.
4. Chạy lại `supabase/automation-schedule.sql`. Script cập nhật job cùng tên, không tạo lịch trùng. Giữ nguyên Vault `nep_cron_secret` và `CRON_SECRET`. Timeout HTTP cron mới là 310 giây.
5. Mở `/automation/`, chọn **Mỗi 2 giờ · 12 bài** nếu muốn đổi sang lịch này, chọn nguồn/kênh, bật lịch, xác nhận tự đăng và lưu. Lịch đã lưu trước đây không tự bị đổi giờ. Migration đặt AI lịch hiện có về Gemini `gemini-3.5-flash-lite`, Siêu ngắn; lịch đang tắt vẫn tắt.

Migration không xóa sản phẩm, ảnh, bài hay token. Nếu đang có lượt AI chạy khi cấu hình thay đổi, server kiểm tra lại và giữ bản nháp thay vì đăng theo cấu hình cũ.

## Cách hoạt động

Đến giờ → chọn một sản phẩm và một kênh trong nguồn bạn chọn → kiểm tra token và quota Meta → AI viết bài mới → kiểm tra nội dung/link/ảnh → tự đăng công khai → lưu lịch sử. Không cần tạo sẵn bài AI.

Sản phẩm phải có trạng thái **Sẵn sàng**, tích **Tôi đã kiểm tra thông tin nguồn**, đủ tên, mô tả gốc và link HTTPS. Có thể chọn toàn bộ kho, danh sách sản phẩm hoặc danh mục. Không có ảnh/đặt 0 ảnh thì loại Instagram; dùng tối đa 10 ảnh thực có của chính sản phẩm, không lấy ảnh sản phẩm khác.

Đã bỏ giới hạn một lần sáng/một lần tối cho mỗi sản phẩm, trần lượt cron/ngày và trần 30 lượt AI/24h của Nếp. Sản phẩm có thể được chọn lại ở nhiều khung giờ trong ngày, cả khi đăng thủ công. `daily_limit` và bảng lượt sản phẩm cũ chỉ còn để tương thích, không tham gia chặn trong bản mới.

Mỗi mốc giờ là một bài trên một kênh. Lịch hiện cho cấu hình 1–24 mốc/ngày, cách nhau ít nhất 15 phút; đây là phạm vi cấu hình lịch, không phải quota sản phẩm hoặc tài khoản. Mẫu Mỗi 2 giờ: 00:00, 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00 (giờ Việt Nam).

Cron kiểm tra mỗi phút, chỉ nhận mốc vừa đến trong cửa sổ 5 phút cùng ngày, không chạy bù các giờ cũ hơn. Khóa theo mốc giờ ngăn cron nhận trùng; một tài khoản chỉ có một lượt AI đang chạy. Đóng tab/tắt máy không làm lịch server dừng.

## Nội dung mặc định và thử lại AI

- Tự động mặc định: **Gemini `gemini-3.5-flash-lite`**, **Siêu ngắn**, chạm đúng **một phiền toái cụ thể trong sinh hoạt** ngay câu mở đầu. Không mở đầu chung chung, không bịa trải nghiệm, công dụng, giá hoặc giảm giá. Vẫn có thể đổi provider/model/độ dài trong nhóm AI viết bài.
- Phần AI viết tối đa 150 ký tự Facebook, 120 Threads, 180 Instagram; câu đầu tối đa 70 ký tự, không quá 3 dòng. Hệ thống tự thêm thông báo affiliate và link gốc rồi kiểm tra bài cuối theo kênh.
- AI lỗi HTTP/mạng/JSON hoặc bài không đạt kiểm tra: tối đa **5 lần gọi tổng cộng** (lần đầu + tối đa 4 lần thử lại), chờ khoảng 10 giây sau lần lỗi. Dừng ngay khi thành công. Mỗi yêu cầu AI chờ tối đa 30 giây.
- Giữ nguyên provider/model ở mọi lần thử. Một chuỗi thử lại giữ một khóa AI; chỉ lưu một bộ bản nháp sau khi thành công. Không gọi lại AI để thử sửa lỗi lưu database.
- Có ngân sách thời gian tổng cho cron 300 giây, kiểm tra trước lần thử tiếp theo và trước khi đăng. Nếu không đủ thời gian, có thể dừng sớm hơn 5 lần. Không thử vô hạn.
- Nhật ký ghi từng lần AI lỗi, thời điểm và thông báo chờ thử lại; thành công ghi số lần gọi AI. Nếu vẫn lỗi sau các lần thử, lịch tạm dừng để xử lý. Các lần lỗi có thể vẫn tiêu thụ token/quota Google; nếu không biết tổng token thì không hiển thị con số đoán.
- Cơ chế 5 lần áp dụng cron viết bài. Nút tạo bài thủ công và tạo ảnh AI vẫn là một yêu cầu mỗi lần bấm.

Giữ `GEMINI_API_KEY` trên server Vercel. Đặt `GEMINI_MODEL=gemini-3.5-flash-lite` nếu muốn đồng nhất lựa chọn mặc định thủ công; model điền rõ trong lịch được ưu tiên. Free tier/chi phí phụ thuộc tài khoản Google, không có cam kết miễn phí vô hạn.

## Hạn mức nền tảng và chống gửi trùng

Instagram/Threads đọc quota thật qua `content_publishing_limit`/`threads_publishing_limit` với `quota_usage` và `config.quota_total`; không hardcode số bài/ngày. Facebook theo phản hồi quyền/rate limit của API. Nếp kiểm tra trước AI và trước khi gửi; nền tảng vẫn có thể từ chối nếu hạn mức hoặc quyền thay đổi giữa hai bước.

**5 lần thử chỉ dành cho AI viết, không lặp lệnh gửi bài sang Meta.** Mỗi bản nháp chỉ được chuyển draft → publishing một lần bằng cập nhật có điều kiện. Bài published/publishing/unknown không tự gửi lại. Nếu chưa rõ kết quả, kiểm tra trực tiếp trên nền tảng trước khi bật lại lịch.

Meta báo hết quota, token/quyền lỗi hoặc lỗi đăng thì ghi nhật ký và tạm dừng. Không tự cấp lại quyền bị thu hồi. Bỏ trần nội bộ không bỏ qua chính sách hay quota Meta/Google.

## Đăng nhập, dữ liệu và lỗi

Giữ màn hình đăng nhập trước mọi trang quản trị, xác nhận đúng `CONTENT_ADMIN_USER_ID` từ server, xác thực API mỗi yêu cầu và RLS. Không đổi cách lưu WebP private, không đưa khóa bí mật vào frontend.

Lỗi chi tiết tự hết hạn sau 8 giờ; job dọn riêng chạy mỗi phút kể cả tắt lịch đăng. Tóm tắt lượt hoàn tất giữ 48 giờ. Không tự xóa sản phẩm, ảnh hoặc bài đã lưu. Lịch sử/lỗi phân trang 6 mục, tự cập nhật mỗi 30 giây.

## Cài mới

Sau schema sản phẩm/ảnh, nội dung, social-v2 và các SQL OAuth cần dùng, chạy:

1. `automation.sql`
2. `automation-controls.sql`
3. `automation-flex.sql`
4. `automation-times.sql`
5. `automation-unrestricted.sql`
6. `automation-schedule.sql`

Trước script lịch, cài `CRON_SECRET` dài ít nhất 32 ký tự trong Vercel và Vault secret `nep_cron_secret` cùng giá trị. Có hai job `nep-hourly-publish` và `nep-cleanup-errors`. Tên legacy hourly không quyết định tần suất; giờ đã lưu mới quyết định.

Mở `/api/automation/cron/` trực tiếp thấy Unauthorized là bình thường vì thiếu header xác thực. Cron Job runs chỉ chứng minh lệnh chạy/xếp hàng; kết quả đăng xem trong quản trị. Kiểm tra HTTP gần nhất, không đọc header chứa khóa:

```sql
select id,status_code,error_msg,created from net._http_response order by created desc limit 10;
```

Tài liệu chính thức:

- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://developers.facebook.com/documentation/threads/overview
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit
- https://vercel.com/docs/functions/configuring-functions/duration

Đã kiểm thử source/migration cục bộ, chưa chạy migration trên Supabase hoặc đăng bài thật lên tài khoản của bạn.
