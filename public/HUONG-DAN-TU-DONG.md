# Nếp 2.7 — chọn 6, 8 hoặc 10 giờ đăng mỗi ngày

## Nâng cấp từ 2.6

1. Trong Supabase SQL Editor, chạy `supabase/automation-times.sql`.
2. Chạy lại `supabase/automation-schedule.sql`. Script cập nhật job cũ theo cùng tên, không tạo lịch trùng. Giữ nguyên CRON_SECRET và secret Vault.
3. Cập nhật source 2.7 lên Vercel và redeploy.
4. Mở https://nep-hp.vercel.app/automation/ → chọn mẫu 6 / 8 / 10 bài mỗi ngày, thêm/bỏ giờ theo ý muốn → chọn sản phẩm/kênh → bật, xác nhận tự đăng và lưu.

Lịch sáng/tối cũ được giữ khi chỉ chạy migration. Khi mở và lưu ở giao diện mới, các giờ cũ được chuyển thành danh sách giờ riêng. Không tự bật lịch đang tắt. Nếu nâng cấp từ bản cũ hơn 2.6, chạy các migration còn thiếu theo thứ tự ở mục cài mới.

## Cách dùng hằng ngày

- Bước 1: Chọn giờ đăng. Mẫu 8 bài/ngày: 07:00, 09:00, 11:00, 14:00, 17:00, 19:00, 21:00, 23:00. Có mẫu 6 và 10; được thêm/bỏ từng giờ.
- Mỗi giờ đã chọn là tối đa **một bài trên một kênh**. Cho phép 1–24 giờ/ngày; hai giờ cách nhau ít nhất 15 phút, kể cả qua nửa đêm. Giờ tính theo Việt Nam.
- Bước 2: Chọn toàn bộ kho, danh sách sản phẩm riêng hoặc danh mục riêng. Hệ thống chọn ngẫu nhiên trong nguồn đó. Chỉ sản phẩm Sẵn sàng, đã kiểm tra nguồn, có tên/mô tả/link HTTPS và còn lượt mới được chọn.
- Bước 3: Bật Facebook/Threads/Instagram, chọn số ảnh tối đa. Đặt 0 = chỉ chữ. Không có ảnh thì bỏ Instagram, không lấy ảnh của sản phẩm khác. Hỗ trợ tối đa 10 ảnh, dùng số ảnh thực có nếu ít hơn.
- AI và giới hạn nâng cao được thu gọn. Gemini mặc định; model để trống dùng model trên server. Chi phí/quota tùy tài khoản, không bảo đảm model Gemini nào cũng miễn phí.
- Bấm Lưu lịch đăng. Đóng web hoặc tắt máy không làm lịch dừng, miễn Supabase/Vercel và token/AI vẫn hoạt động.

Số bài thực tế có thể ít hơn số giờ đã chọn nếu thiếu sản phẩm còn lượt, lỗi hoặc hết hạn mức. Giới hạn ngày gồm các lượt đã nhận, cả lượt lỗi/bỏ qua; tổng AI thủ công và tự động tối đa 30 lượt/24 giờ. Không tự chuyển sang nhà cung cấp trả phí khác khi lỗi.

## Giới hạn sản phẩm và chống đăng lặp

- Vẫn tối đa **một lần trước 12:00 + một lần từ 12:00 mỗi sản phẩm/ngày**, tính chung tất cả kênh và cả đăng thủ công qua Nếp. Bài đăng ngoài Nếp không tự được đồng bộ để đếm.
- Danh sách giờ mới cho phép đăng buổi trưa/chiều và các giờ khác trong 24 giờ; không bị giới hạn trong hai khoảng cũ.
- PostgreSQL giữ khóa theo sản phẩm/ngày/buổi; mỗi mốc giờ có khóa riêng. Gọi endpoint nhiều lần không tạo thêm lượt đã nhận. Lịch dọn lỗi không làm mất giới hạn.
- Bài chưa rõ kết quả vẫn giữ chỗ. Không tự retry bài unknown/publishing. Đổi tài khoản đích làm lịch dừng để xác nhận lại.
- Scheduler kiểm tra mỗi phút. Có cửa sổ chờ tối đa 5 phút cùng ngày để nhận một giờ vừa đến; không chạy bù các giờ cũ hơn. Thời gian chính xác còn phụ thuộc dịch vụ.
- Trong UI có nút Tắt lịch; bài đã gửi Meta có thể vẫn hoàn tất. Nếu sửa/tắt trong lúc AI viết, server kiểm tra lại trước khi gửi.

## Giao diện và phân trang

- Sản phẩm: 12/trang; ảnh: 24/trang, có tìm kiếm; danh mục: 10/trang, có tìm kiếm.
- Bài AI: 6/trang, lọc kênh/trạng thái tại server, có thể xem bài cũ qua các trang. Chuyển trang/lọc có cảnh báo nếu còn chỉnh sửa chưa lưu.
- Nhật ký lỗi và lịch sử tự động: 6/trang, lấy dữ liệu theo trang từ server; tự cập nhật mỗi 30 giây.
- Danh sách chọn sản phẩm/danh mục cho lịch: 10/trang, lựa chọn được giữ khi đổi trang/tìm kiếm.
- Kho metadata hiện hỗ trợ tối đa 1.000 sản phẩm. Nếu vượt giới hạn, báo rõ thay vì âm thầm bỏ sản phẩm cuối. Phân trang sản phẩm/ảnh/danh mục dùng dữ liệu đã tải trong phạm vi này; lịch sử bài và nhật ký phân trang trực tiếp ở database.
- AI nâng cao, tạo ảnh AI, kết nối, hướng dẫn cài đặt và nhật ký mặc định thu gọn; mở khi cần. Khi OAuth trả về, nhóm kết nối tương ứng tự mở để thấy kết quả.

## Danh mục và nội dung

Mở `/categories/` để tạo, đổi tên/gộp hoặc xóa nhóm. Nhập tên nhóm mới trong form sản phẩm cũng được. Xóa nhóm chuyển sản phẩm về Khác và tạm dừng lịch đang lọc nhóm đó; không mở rộng lịch sang toàn bộ nhóm Khác. Khác là nhóm dự phòng, không xóa/đổi tên.

Bản nháp AI có thể xóa từng bài hoặc các bản nháp trên trang đang xem. Bài đã đăng dùng Gỡ khỏi thư viện để ẩn tại Nếp; không xóa bài trên Meta, không xóa bằng chứng chống đăng trùng. Bài đang gửi/chưa rõ kết quả được bảo vệ.

## Token và lỗi 8 giờ

- Kiểm tra token và thử đọc tài khoản Meta trước khi gọi AI. Kiểm tra đọc không bảo đảm có đủ quyền đăng; lỗi publish vẫn được ghi lại.
- Nhật ký có thời điểm, kênh, bước xử lý, loại lỗi, HTTP/code/subcode và cách khắc phục. Lỗi token, quyền, AI, quota, mạng, cấu hình và dữ liệu được phân biệt; không gọi mọi lỗi mạng là lỗi token.
- Lỗi làm lịch tạm dừng. Vào Thiết lập để kết nối lại/gia hạn nếu phù hợp, kiểm tra bài trên Meta, rồi xác nhận bật lại. Không thể tự cấp lại quyền đã bị thu hồi mà không có người dùng.
- Lỗi chi tiết hết hạn sau 8 giờ. Job dọn riêng chạy mỗi phút kể cả khi lịch đăng tắt; xóa vật lý ở lượt cron kế tiếp. Nếu dịch vụ bị dừng thì việc xóa đợi đến khi hoạt động trở lại.
- Tóm tắt các lượt hoàn tất giữ 48 giờ; sổ giới hạn sản phẩm giữ ngày hiện tại và hôm trước. Không xóa sản phẩm, ảnh hoặc nội dung đã lưu.
- Có ghi lỗi tạo/đăng thủ công vào cùng nhật ký sau xác thực. Nếu database mất kết nối thì chính việc ghi lỗi cũng có thể thất bại; khi đó xem lỗi phản hồi/Vercel logs.

## Cài mới từ đầu

Sau các migration sản phẩm/ảnh, nội dung và OAuth của bản gốc (`setup.sql`, `content.sql`, `social-v2.sql` và các SQL OAuth cần dùng), chạy:

1. `automation.sql`
2. `automation-controls.sql`
3. `automation-flex.sql`
4. `automation-times.sql`
5. `automation-schedule.sql` (sau khi cài khóa bên dưới)

Cài khóa:

- Tạo chuỗi ngẫu nhiên ít nhất 32 ký tự. Có thể dùng trình quản lý mật khẩu hoặc Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Vercel → Settings → Environment Variables: thêm `CRON_SECRET` bằng chuỗi trên, phạm vi Production, rồi redeploy. Không dùng NEXT_PUBLIC_.
- Supabase Vault: tạo secret `nep_cron_secret` bằng giá trị giống CRON_SECRET. Nếu đã có, cập nhật secret hiện tại, không tạo trùng tên.
- Bật `pg_cron`, `pg_net`, chạy `automation-schedule.sql`. Có hai job `nep-hourly-publish` và `nep-cleanup-errors`.
- Không gửi khóa trong chat, commit vào Git hoặc đặt trong URL công khai.

Nếu đổi tên miền, sửa URL trong script lịch rồi chạy lại. Endpoint đúng mặc định: `https://nep-hp.vercel.app/api/automation/cron/`. Mở trực tiếp trong trình duyệt thấy Unauthorized là bình thường vì thiếu header xác thực. Nếu Supabase cũng nhận HTTP 401, kiểm tra Vault/CRON_SECRET và redeploy.

Cron Job runs chỉ cho thấy lệnh đã chạy hoặc HTTP được xếp hàng. Kết quả đăng xem trong quản trị. SQL kiểm tra HTTP gần nhất, không đọc headers chứa khóa:

```sql
select id,status_code,error_msg,created from net._http_response order by created desc limit 10;
```

Muốn gỡ lịch đăng nhưng giữ dọn lỗi:

```sql
select cron.unschedule('nep-hourly-publish');
```

Tài liệu chính thức: https://supabase.com/docs/guides/cron và https://developers.facebook.com/docs/graph-api/guides/error-handling/
