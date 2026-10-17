# Nếp 2.10.0 — Link đúng vị trí theo nền tảng

Áp dụng cho tạo bài thủ công, cron, bài chữ/ảnh và Reel. Không đổi model hay cơ chế thử lại AI của bản 2.9.1.

| Kênh | Nội dung công khai | Link mua |
| --- | --- | --- |
| Facebook | Không URL; kết thúc bằng “Link săn deal mình ghim ở bình luận đầu tiên nha 👇” | Server gửi bình luận sau khi lưu mã bài đã đăng |
| Instagram | Không URL; kết thúc bằng “Link mua chính hãng ở trên Bio mình nhé 🛒” | Bạn đặt trong Bio, có thể dùng trang tổng hợp sản phẩm |
| Threads | Nội dung + thông báo hoa hồng + link gốc | Cuối bài, giữ nguyên mã affiliate |

Thông báo hoa hồng vẫn có trong bài trên cả ba kênh và trong bình luận Facebook. Đây là lựa chọn phân phối nội dung, không phải cam kết thuật toán sẽ tăng reach.

## Nâng cấp từ 2.9.1

1. Tạm tắt lịch trong lúc cập nhật để tránh source cũ đăng bài theo cách cũ.
2. Chạy toàn bộ `supabase/affiliate-placement.sql` trong Supabase SQL Editor. Nếu chưa nâng cấp Reel thì chạy `reels.sql` trước. Không chạy lại mọi migration từ đầu.
3. Deploy source 2.10.0 lên Vercel như các bản trước. Không cần đổi CRON_SECRET, Vault hoặc cài lại cron.
4. Trong Meta App, bổ sung quyền `pages_manage_engagement` cho luồng Facebook. Nếu dùng Facebook Login for Business với `FACEBOOK_LOGIN_CONFIG_ID`, phải thêm quyền vào đúng configuration; source không thể thay scope của configuration từ trình duyệt. Với người dùng ngoài vai trò app, quyền cần mức truy cập/App Review theo yêu cầu Meta.
5. Vào Thiết lập → Facebook → Kết nối lại, cấp quyền mới rồi chọn đúng Fanpage. Token cũ không tự có quyền chỉ vì đã deploy. Nếu dùng Page token nhập bằng biến môi trường, tạo lại token có quyền này rồi cập nhật Vercel và redeploy. Không gửi token qua chat.
6. Đặt link mua hoặc một trang tổng hợp các sản phẩm vào phần liên kết của Bio Instagram. CTA “chính hãng” chỉ nên dùng với nguồn hàng bạn đã xác minh. Không đặt URL trang quản trị riêng tư làm trang mua hàng.
7. Mở lại Nội dung AI: bản nháp cũ sẽ được hiển thị theo vị trí link mới; kiểm tra, lưu/duyệt một bài rồi thử đăng. Bài đã xuất bản trước đây giữ nguyên, không bị sửa hay bình luận bổ sung hàng loạt.
8. Sau khi thử thành công, bật và lưu lại lịch. Thời gian, sản phẩm và kênh đã chọn vẫn giữ nguyên.

## Facebook: bài thành công, bình luận lỗi thì sao?

- Lưu `status=published` và `external_id` trước khi gửi bình luận. Bài không trở về nháp chỉ vì bình luận lỗi.
- Chụp link affiliate từ sản phẩm vào `affiliate_comment_text` khi nhận lượt đăng. Sau đó sản phẩm đổi link cũng không làm bình luận đang gửi bị đổi đích.
- Claim `pending → sending` bằng cập nhật có điều kiện trước một lần gọi `POST /{object-id}/comments` với Page token. Photo ưu tiên `post_id` nếu Meta trả cả mã ảnh và mã bài; Reel dùng mã video đã xuất bản.
- `sent`: đã có mã bình luận. `failed`: chưa gửi hoặc Meta từ chối rõ ràng. `unknown`: mất kết nối/phản hồi không rõ hoặc không lưu được kết quả. `pending/sending` còn lại sau khi tiến trình dừng cũng cần kiểm tra.
- Không tự retry bình luận và không tự đăng lại bài. Cron ghi cảnh báo vào lịch sử, tiếp tục các khung giờ sau. Lỗi bình luận có chi tiết trong nhật ký hiện tại, tự hết hạn sau 8 giờ; trạng thái bình luận gắn với bài được giữ để tránh gửi trùng.
- Bộ lọc **Cần xác minh** gồm cả bài đã đăng có bình luận chưa xác nhận. Mở bài trên Facebook để kiểm tra; nếu chưa có, dùng **Sao chép bình luận** rồi thêm thủ công.
- Hệ thống gửi bình luận ngay sau bài nhưng không bảo đảm đứng đầu nếu có người khác bình luận đồng thời hoặc Facebook đổi thứ tự hiển thị. **Chưa tự ghim bằng API**: bạn ghim bình luận trên Facebook. CTA dùng đúng câu bạn yêu cầu.

## Instagram: Bio và DM

Luồng hiện tại chỉ xuất bản caption/media, chưa có chatbot. Tham chiếu IG User công khai không hỗ trợ cập nhật profile bằng endpoint này, nên bản này không giả lập lệnh sửa Bio. Đặt một link trang tổng hợp sản phẩm vào Bio thủ công sẽ phù hợp hơn thay Bio cho từng bài: bài cũ vẫn tìm được sản phẩm cũ.

Có thể bổ sung Private Replies theo luồng sau, nhưng chưa bật trong bản này:

1. Người xem chủ động bình luận từ khóa, ví dụ DEAL, dưới bài.
2. Webhook comments xác thực chữ ký Meta, nhận comment ID và media ID; đối chiếu `external_id` của bài để tìm đúng sản phẩm/link đã lưu.
3. Claim comment ID trong bảng có unique constraint để webhook lặp không gửi trùng; gửi một private reply chứa link đúng sản phẩm bằng API chính thức.
4. Cần app/webhook và quyền comments/messages phù hợp với Facebook Login hoặc Instagram Login; token đăng bài hiện tại chưa đủ để mặc định bật bot.
5. Theo tài liệu Meta hiện hành: một private reply cho bình luận trong cửa sổ 7 ngày; không tự gửi chuỗi tin nhắn tiếp theo khi người dùng chưa trả lời. Cần triển khai thêm xử lý quyền, cửa sổ phản hồi và lỗi độc lập.

## Phạm vi kiểm tra

Kiểm thử giả lập API: vị trí URL/CTA, bản nháp cũ, ảnh/Reel, lấy đúng mã bài ảnh, claim bình luận đồng thời, lỗi quyền/timeout/JSON/lưu DB, không gửi lại, cron không tắt lịch vì lỗi bình luận. Migration được kiểm tra chạy lặp và giữ RLS. Không dùng token thật để đăng bài hoặc bình luận trên tài khoản của bạn.

Nguồn đối chiếu:
- https://developers.facebook.com/docs/graph-api/reference/object/comments/
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user
- https://developers.facebook.com/documentation/instagram-platform/private-replies
