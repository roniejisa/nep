# Nếp 2.9 — Bài thường và Reel trong cùng lịch

## Bản này làm được gì?

- Đăng Reel có video lên Facebook Fanpage và Instagram Professional qua API hiện có.
- Giữ nguyên link affiliate và thông báo hoa hồng trong mô tả Reel.
- Chọn Bài thường/Reel khi tạo nội dung thủ công; AI viết mô tả ngắn cho video, không tự dựng video.
- Lịch tự động chọn Chỉ bài thường, Chỉ Reel hoặc Trộn ngẫu nhiên. Mỗi giờ có lựa chọn riêng để ghi đè chế độ chung. Ví dụ 08:00 bài thường, 10:00 Reel, 12:00 bài thường.
- Chỉ chọn video đã xác nhận, thuộc đúng sản phẩm và chủ tài khoản. Không có video phù hợp thì lượt Chỉ Reel bị bỏ qua; không tự đổi sang bài thường. Chế độ Trộn chọn trong các định dạng/media thực sự có.
- Threads không có định dạng Reel trong tích hợp này; chỉ nhận bài thường như trước.

## Link mô tả khác thẻ sản phẩm Shopee

Link được gắn trong mô tả không đồng nghĩa có thẻ sản phẩm/giỏ hàng bấm được trên video. Khả năng bấm link mô tả phụ thuộc nền tảng/tài khoản; không bảo đảm link bấm trực tiếp, đặc biệt trên Instagram.

Shopee có chương trình Facebook Affiliate Partnership và Instagram Affiliate Partnership, cho tài khoản đủ điều kiện liên kết và gắn thẻ sản phẩm. Tài liệu công khai đã kiểm tra chưa cung cấp luồng API để tự tạo thẻ Shopee này chỉ từ link affiliate và các token Nếp đang có. Bản này **không báo rằng đã tự gắn giỏ hàng**, không đổi link thành mã sản phẩm giả và không đặt CTA sai như “bấm giỏ hàng” khi chưa có thẻ.

Nếu cần thẻ sản phẩm bấm được, liên kết Shopee–Meta theo hướng dẫn chính thức, rồi dùng tính năng thêm sản phẩm trong Meta/Hub cho nội dung/tài khoản được hỗ trợ. Một số tài khoản có thể thêm thẻ vào nội dung đã đăng; phải kiểm tra trên tài khoản thực tế. Không cần gửi mật khẩu hay khóa bí mật cho chúng tôi.

Hướng dẫn Shopee chính thức:

- https://help.shopee.vn/portal/10/article/190889
- https://help.shopee.vn/portal/10/article/206203

## Nâng cấp từ 2.8

1. Supabase → SQL Editor: chạy **toàn bộ `supabase/reels.sql`** sau `automation-unrestricted.sql`. Script tạo bảng video, bucket private và thêm định dạng vào bài/lịch. Có thể chạy lại; giữ nguyên bài cũ, giờ cũ, provider/model và các token. Định dạng lịch cũ mặc định là Bài thường.
2. Chép nội dung thư mục `nep/` trong ZIP vào gốc repository và deploy Vercel. Giữ nguyên các biến môi trường, OAuth callback và Fluid Compute 300 giây. Không có khóa mới bắt buộc riêng cho Reel.
3. Nếu còn hai file cũ `app/automation/page.tsx`, `app/categories/page.tsx`, xóa chúng; giữ các trang tương ứng trong `app/(admin)/`. Không xóa API.
4. Nếu đã cài cron bản 2.8, **không cần cài lại cron**. Nếu chưa có bản 2.8, làm theo `AUTOMATION-2.8.md` trước để bỏ các giới hạn cũ và cập nhật timeout cron.
5. Vào Nội dung AI, chọn sản phẩm rồi tải video theo mục dưới đây. Sau đó chỉnh/lưu lịch trong Lịch tự đăng. Lưu thay đổi khi lịch bật vẫn cần xác nhận tự đăng như trước.

Nếu đã đăng Facebook/Instagram thường, giữ kết nối đang có. Reel vẫn cần quyền đăng video/nội dung hợp lệ của tài khoản đích; nếu Meta từ chối, xem nhật ký quyền/token và kết nối lại khi cần. Không thay đổi quyền quản lý Fanpage/Business.

## Chuẩn bị và tải video

1. Trong **Nội dung AI**, chọn sản phẩm.
2. Mở **Video sản phẩm · dùng cho Reel**.
3. Tích xác nhận bạn có quyền sử dụng video, video đúng sản phẩm và đồng ý cho lịch tự đăng dùng video này.
4. Chọn file MP4. Đợi thông báo đã lưu. Video được chọn cho lần tạo nội dung thủ công; lịch tự động chọn ngẫu nhiên một video đã xác nhận của sản phẩm.

Mẫu tương thích của bản này: MP4, video dọc 9:16, 4–60 giây, tối thiểu 540×960, tối đa 50 MB. Nên xuất H.264, âm thanh AAC, 30 fps và fast-start. Đây là cấu hình bảo đảm thao tác gọn của ứng dụng, không khẳng định là toàn bộ khả năng tối đa của Meta. Trình duyệt kiểm tra định dạng đầu file, kích thước, thời lượng và khung hình; Meta vẫn kiểm tra codec/âm thanh khi xử lý. Không tự nén/chuyển mã hoặc tạo video AI.

File video tải trực tiếp từ trình duyệt vào bucket riêng tư `affiliate-product-videos`, tránh giới hạn body upload của Vercel. Server xác thực quản trị viên, kiểm tra sản phẩm, đối chiếu size/MIME trên Storage rồi đăng ký metadata. Ảnh vẫn chỉ WebP trong bucket ảnh cũ; không đưa MP4 vào bucket ảnh.

Danh sách video phân trang 6 mục; preview chỉ tải khi bạn phát. Nếu URL preview hết hạn, bấm Làm mới video. Video đã dùng trong bản nháp/bài đang gửi/cần xác minh được chặn xóa trong giao diện; xử lý bài trước. Xóa sản phẩm dọn cả video liên quan nhưng chặn nếu có bài đang gửi/cần xác minh.

Nếu tải file xong nhưng mất phản hồi đăng ký, làm mới để kiểm tra trước khi tải lại. Ứng dụng giữ file trong trường hợp chưa rõ đăng ký đã thành công, tránh xóa mất video hợp lệ; nếu không có bản ghi sau khi kiểm tra, quản trị viên có thể dọn file thừa trong Storage.

## Đăng thủ công

- Chọn **Định dạng → Reel**, chọn Facebook và/hoặc Instagram. Threads bị tắt ở chế độ này.
- Chọn video đã lưu, bấm **Viết mô tả Reel**.
- Xem video, nội dung, link và tài khoản đích; tích duyệt rồi bấm **Đăng Reel**. Nút tạo bản mới dùng lại đúng định dạng/video của bản nháp đó.
- Lưu bản nháp chỉ lưu mô tả, không gửi Meta. Bài cũ vẫn là Bài thường; không tự biến ảnh/bài chữ thành Reel.

## Lịch tự động linh hoạt

Ở **Lịch tự đăng → Định dạng tự động**:

- **Chỉ bài thường:** giữ luồng chữ/ảnh hiện tại.
- **Chỉ Reel:** chỉ chọn Facebook/Instagram và sản phẩm có video đã xác nhận.
- **Trộn ngẫu nhiên:** chọn trong các tổ hợp sản phẩm/kênh/định dạng có đủ media; không bảo đảm tỷ lệ 50/50.

Ở mỗi giờ, chọn **Theo chế độ chung**, **Bài thường** hoặc **Reel**. Lựa chọn riêng có ưu tiên cao nhất. Xóa giờ sẽ xóa lựa chọn định dạng của giờ đó. Chọn mẫu giờ mới chỉ giữ các lựa chọn riêng vẫn thuộc danh sách giờ mới.

Giữ cơ chế Gemini 3.5 Flash-Lite, Siêu ngắn, góc phiền toái và tối đa 5 lần gọi AI cách khoảng 10 giây khi lỗi. Với Reel, mỗi yêu cầu AI tối đa 25 giây và ngân sách AI kết thúc sớm hơn để chừa thời gian Meta xử lý video. Nếu gần hết ngân sách tổng 300 giây, giữ bản nháp/dừng thay vì cố gửi.

## Xác nhận kết quả và xử lý lỗi

Facebook: tạo phiên Reel → lưu video ID → upload từ URL video có hạn → hoàn tất với mô tả → đọc trạng thái đến khi publishing complete. Instagram: tạo container REELS → lưu ID → chờ FINISHED → media_publish. Không đánh dấu thành công chỉ vì upload xong.

Lệnh tạo/upload/đăng không tự retry. Chỉ các lần **đọc trạng thái** được lặp trong thời gian cho phép. Nếu Meta xử lý quá lâu, mất mạng, hoặc không lưu được kết quả, bài chuyển **Cần xác minh**, lịch dừng và giữ container ID để đối chiếu; không tự upload lại. Một Reel có thể xuất hiện muộn trên Meta sau khi server đã hết thời gian, vì vậy phải kiểm tra trước khi xử lý lại.

Nhật ký token, quota, AI và lỗi đăng vẫn tự hết hạn sau 8 giờ; các quyền RLS và khóa màn hình trước đăng nhập vẫn giữ. Video preview có URL ký 15 phút, Meta nhận URL ký một giờ; không công khai bucket.

## Kiểm chứng

Có kiểm thử mô phỏng API cho Facebook/Instagram Reels, không gửi trùng, gắn nguyên link mô tả, ưu tiên định dạng từng giờ, chỉ lấy video đúng sản phẩm, migration giữ dữ liệu cũ, RLS và bucket riêng tư. Chưa dùng token thật để đăng Reel hay xác nhận thẻ Shopee trên tài khoản của bạn. Sau deploy, nên thử một Reel thủ công trước khi bật lịch Reel.

API tham chiếu chính thức:

- https://developers.facebook.com/documentation/video-api/guides/reels-publishing
- https://developers.facebook.com/documentation/instagram-platform/content-publishing
- https://github.com/fbsamples/Facebook-Reels-Publishing-API-Postman-Collection
