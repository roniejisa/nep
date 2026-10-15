# Nếp 2.6 — nguồn sản phẩm, danh mục, nhiều ảnh và lịch tùy chỉnh

Trang quản trị sau khi cập nhật: https://nep-hp.vercel.app/automation/

## Nâng cấp từ 2.5

1. Trong Supabase SQL Editor, chạy `supabase/automation-flex.sql`.
2. Chạy lại `supabase/automation-schedule.sql` để scheduler nhận giờ/phút tùy chỉnh. Giữ nguyên CRON_SECRET/Vault. Dùng cùng tên job nên không tạo trùng lịch đăng.
3. Cập nhật source 2.6 lên Vercel, redeploy.
4. Vào `/automation/`: chỉnh giờ/phút, chọn toàn bộ kho hoặc sản phẩm/danh mục cụ thể, đặt số ảnh tối đa, xác nhận và lưu lại.

Nếu đang ở bản 2.4: chạy `automation-controls.sql` trước `automation-flex.sql`. Nếu chưa cài tự động hóa: làm phần cài mới. Các migration không xóa sản phẩm/ảnh/bài hiện có.

## Sản phẩm và danh mục

- Mở `/categories/` hoặc nút Tạo & quản lý danh mục trong kho sản phẩm. Có thể tạo nhóm rỗng trước khi thêm hàng.
- Đổi tên danh mục cập nhật sản phẩm và bộ lọc lịch tương ứng; đổi sang một tên đã có sẽ gộp nhóm.
- Xóa nhóm chuyển sản phẩm sang Khác và tạm dừng lịch đang lọc nhóm đó. Không tự mở rộng bộ lọc sang toàn bộ nhóm Khác.
- Danh mục Khác là nhóm dự phòng, không xóa/đổi tên. Form sản phẩm cũng cho nhập tên nhóm mới.
- Ba cách chọn nguồn tự động: ngẫu nhiên toàn bộ kho; ngẫu nhiên trong các sản phẩm được đánh dấu; ngẫu nhiên trong các danh mục được đánh dấu. Mỗi giờ vẫn tối đa một sản phẩm/kênh. Chỉ sản phẩm Sẵn sàng, nguồn đã kiểm tra, còn lượt đăng mới được dùng.
- Có thể chọn tối đa 1.000 sản phẩm hoặc 200 danh mục cho một cấu hình; dữ liệu kho đọc tối đa 1.000 sản phẩm. Chọn nhiều mục không đảm bảo mọi mục sẽ được đăng trong ngày vì còn số giờ và hạn mức.

## Chọn ảnh và xóa bài AI

- Chọn tối đa 0–10 ảnh cho tự động. 0 = chỉ chữ. Lấy ngẫu nhiên không trùng từ ảnh của đúng sản phẩm; có 2 ảnh mà đặt 5 thì chỉ dùng 2.
- Instagram tự loại khỏi tập kênh ứng viên nếu sản phẩm không có ảnh hoặc cấu hình đặt 0 ảnh. Facebook/Threads còn được chọn nếu đã bật. Nếu chỉ bật Instagram và không còn sản phẩm có ảnh, bỏ qua lượt, không gọi AI và không làm tắt lịch.
- Không lấy ảnh từ sản phẩm khác. Ảnh đã bị xóa hoặc không còn thuộc sản phẩm sẽ chặn gửi thay vì dùng nhầm ảnh.
- Facebook đăng nhiều ảnh trong một bài feed; Instagram/Threads đăng carousel khi có từ 2 ảnh, dùng một ảnh khi chỉ có 1. Ứng dụng giới hạn chung 10 ảnh. Mỗi carousel tính một lượt sản phẩm.
- Lưu trữ vẫn chỉ WebP; Meta tải JPEG tạm qua endpoint ảnh. Không tạo bản JPEG thứ hai trong Storage.
- Mục nội dung thủ công có thể chọn nhiều ảnh, xem ảnh và đổi bộ ảnh cho từng bản nháp.
- Nút Xóa bản nháp xóa vĩnh viễn bản nháp khỏi database. Có nút xóa hàng loạt bản nháp đang được tải của kênh đã chọn (lịch sử tải tối đa 50 bài/lần). Các bài đang gửi/chưa rõ kết quả được bảo vệ, phải kiểm tra Meta trước.
- Với bài đã đăng, Gỡ khỏi thư viện ẩn bản ghi khỏi giao diện quản trị. Không gọi API xóa bài trên Meta và không xóa bằng chứng dùng để chặn đăng lặp. Muốn xóa nội dung công khai, thao tác trên nền tảng.

## Cài mới

1. Cần có các migration dữ liệu/nội dung của bản 2.3: `content.sql`, `social-v2.sql`, cùng các bảng OAuth bạn dùng. Không xóa bảng cũ.
2. Chạy lần lượt `supabase/automation.sql`, `supabase/automation-controls.sql`, `supabase/automation-flex.sql`.
3. Tạo chuỗi ngẫu nhiên ít nhất 32 ký tự bằng trình quản lý mật khẩu, hoặc Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Vercel → Settings → Environment Variables: đặt `CRON_SECRET` bằng chuỗi trên, phạm vi Production, rồi redeploy. Không dùng tiền tố NEXT_PUBLIC_.
5. Supabase Vault: tạo secret tên `nep_cron_secret`, giá trị giống CRON_SECRET. Nếu đã có, sửa secret hiện tại, không tạo nhiều secret trùng tên. Không gửi secret trong chat hoặc commit vào Git.
6. Bật extensions `pg_cron`, `pg_net`, chạy `supabase/automation-schedule.sql`.
7. Cấu hình sản phẩm Sẵn sàng, đã kiểm tra nguồn, có tên/mô tả/link HTTPS; thêm ảnh cho Instagram.
8. Mở `/automation/`, đăng nhập qua trang quản trị nếu cần. Chọn AI/model, kênh, hạn mức, khung giờ; bật lịch, xác nhận tự đăng và lưu. Server chốt ID đích đang kết nối.

## Giới hạn đăng sản phẩm

- Theo giờ Việt Nam, mặc định sáng 07:00–trước 12:00, tối 18:00–trước 23:00. Có thể đổi cả giờ và phút trong quản trị. Ví dụ bắt đầu 07:30 thì các lượt sáng đến vào 07:30, 08:30… đến trước giờ kết thúc. Cuối khung tối 00:00 nghĩa là hết ngày (24:00). Khung sáng nằm trong 00–12, khung tối trong 12–24; không chồng nhau.
- Mỗi sản phẩm tối đa **1 lần sáng + 1 lần tối mỗi ngày**, tính chung mọi kênh, cả đăng thủ công qua Nếp. Bài đã đăng bên ngoài Nếp không tự đồng bộ về để đếm.
- Ví dụ: sản phẩm A đã đăng Facebook lúc 08:00 thì không được đăng Threads lúc 09:00. Đến khung tối mới có lượt tiếp theo.
- Mỗi giờ chỉ chọn ngẫu nhiên 1 sản phẩm/kênh/ảnh/góc viết còn lượt. Ngoài khung giờ hoặc hết sản phẩm đủ điều kiện: bỏ qua, không gọi AI, không đăng bù.
- Có khóa tại PostgreSQL và khóa riêng khi chuyển bài sang trạng thái gửi, ngăn hai request đồng thời vượt giới hạn.
- Bài chưa rõ kết quả hoặc đã giữ chỗ gửi vẫn tính lượt. Đây là lựa chọn thận trọng để tránh trùng bài. Kiểm tra Meta; không tự gửi lại bài unknown/publishing.
- Đổi giờ hoặc xóa lịch sử lỗi không tạo thêm lượt sản phẩm trong cùng buổi. Lượt tính theo ngày và buổi, không theo từng khung giờ tùy chỉnh.
- Chỉ tính thao tác đi qua Nếp; nếu gỡ migration/trigger hoặc sửa trực tiếp dữ liệu bằng quyền quản trị thì cơ chế không còn đảm bảo.

## Token và xử lý lỗi

- Trước khi gọi AI, kiểm tra token lưu trữ và thử đọc tài khoản đích từ Meta bằng API chỉ đọc. Token hết hạn/không hợp lệ sẽ chặn trước bước AI. Kiểm tra này không đảm bảo có đủ quyền publish; lỗi quyền có thể chỉ xuất hiện lúc gửi bài.
- Phân biệt token, thiếu quyền, hết hạn mức, mạng/timeout, Meta, AI, cấu hình và cơ sở dữ liệu. Không tự suy ra token sai chỉ vì lỗi mạng.
- Mã lỗi Meta 190/102 được đánh dấu lỗi token; lưu HTTP status, code/subcode khi API trả. Không lưu token, raw provider message hoặc URL chứa khóa.
- Khi lỗi: tắt lịch, ghi thời điểm, kênh, bước đang làm, nguyên nhân và cách xử lý. Trang tự cập nhật mỗi 30 giây.
- Có ghi lỗi tạo/đăng thủ công sau khi xác thực vào cùng nhật ký. Lỗi cài SQL/kết nối DB có thể khiến chính việc ghi nhật ký thất bại; lúc đó xem lỗi phản hồi và Vercel logs. Không thể ghi được vào database đang mất kết nối.
- Token bị thu hồi/không còn hợp lệ cần vào Thiết lập để kết nối lại. Không có cơ chế tự cấp lại quyền người dùng; các nút gia hạn hợp lệ của bản trước vẫn dùng được. Khắc phục xong, xem bài trên Meta rồi xác nhận bật lại lịch.
- Nếu Meta không rõ kết quả, giữ unknown và không tự retry. Tiến trình bị ngắt sẽ được phát hiện ở lượt hợp lệ tiếp theo; dừng để người quản trị xác minh.

## Dọn dữ liệu

- Lỗi chi tiết có `expires_at = thời điểm ghi + 8 giờ`. API không trả lỗi đã hết hạn; trang cập nhật mỗi 30 giây.
- Job `nep-cleanup-errors` chạy **mỗi phút**, xóa vật lý lỗi hết hạn ở lượt kế tiếp, thông thường chậm tối đa khoảng một phút so với mốc 8 giờ. Nếu Cron/DB bị dừng, việc xóa vật lý đợi khi dịch vụ hoạt động trở lại.
- Lịch dọn lỗi chạy độc lập, kể cả khi lịch đăng đã tắt vì lỗi token.
- Bản ghi tóm tắt các lượt hoàn tất giữ 48 giờ; không sao chép lỗi chi tiết vào tóm tắt. Chi tiết lỗi cũ của bản 2.4 cũng được làm sạch sau 8 giờ.
- Sổ giữ lượt đăng giữ ngày hiện tại và ngày hôm trước; tách biệt nhật ký lỗi. Dọn lỗi không làm mất bộ đếm sáng/tối.
- Dọn cả lịch sử Cron trên 8 giờ của đúng hai job Nếp; không xóa lịch sử các job khác.
- Không xóa sản phẩm, ảnh, bài đã tạo/đăng hoặc nội dung cần kiểm tra. Các dữ liệu đó vẫn tăng theo sử dụng, nên cơ chế này chỉ giới hạn nhật ký vận hành, không phải giới hạn toàn bộ dung lượng database.

## Vận hành và kiểm tra

Supabase Cron kiểm tra cấu hình mỗi phút, chỉ gọi POST `https://nep-hp.vercel.app/api/automation/cron/` trong khung đang bật và đúng phút bắt đầu của khung đó mỗi giờ. Phút gọi HTTP thực tế phụ thuộc độ sẵn sàng Cron, database và website. Nếu đổi tên miền, sửa URL trong SQL rồi chạy lại. Không cần giữ trình duyệt mở.

- Cùng một giờ tối đa một lượt; tổng AI thủ công và tự động tối đa 30 lượt/24 giờ. Hạn mức tự động 1–24 lượt/ngày tính theo giờ Việt Nam.
- Một nhà cung cấp mỗi lượt, không tự chuyển sang nhà cung cấp trả phí khác. Chi phí/hạn mức phụ thuộc tài khoản và model; Gemini không mặc nhiên miễn phí.
- Dùng ảnh đã lưu WebP, không gọi AI tạo ảnh mới trong lịch. Instagram nhận JPEG tạm qua endpoint ảnh của bản trước.
- AI tự rà soát, server kiểm tra cấu trúc/độ dài/link/disclosure. Không bảo đảm nội dung luôn hấp dẫn hoặc mọi khẳng định đều đúng; dữ liệu nguồn phải được kiểm tra.
- Giới hạn thực thi 120 giây, AI 60 giây; gần hết thời gian thì giữ nháp. Không đọc được chính xác quota token còn lại của mọi nhà cung cấp.
- Đổi đích đăng làm lịch dừng để xác nhận lại. Tắt lịch khi AI đang chạy được kiểm tra lại trước khi gửi; bài đã gửi Meta vẫn có thể hoàn tất.

Mục Cron Job runs chỉ cho thấy lệnh đã được thực thi/xếp hàng HTTP. Kết quả đăng thực tế xem trong quản trị.

SQL xem kết quả HTTP gần nhất, không đọc headers chứa khóa:

```sql
select id,status_code,error_msg,created from net._http_response order by created desc limit 10;
```

HTTP 401: khóa Vault và Vercel chưa khớp hoặc chưa redeploy. HTTP 400: kiểm tra migration/cấu hình. HTTP 200 với `status=failed` vẫn là lượt thất bại, xem Nhật ký lỗi. Supabase bị pause hoặc Vercel không nhận request thì không có đảm bảo lịch chạy đúng giờ.

Tắt đăng bằng nút Tắt lịch ngay. Nếu muốn gỡ scheduler đăng nhưng vẫn dọn lỗi:

```sql
select cron.unschedule('nep-hourly-publish');
```

Tài liệu chính thức:
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://developers.facebook.com/docs/graph-api/guides/error-handling/
- https://vercel.com/docs/cron-jobs/usage-and-pricing
