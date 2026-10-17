# Nếp 2.12.1 — Giữ màn hình quản trị khi chuyển tab

## Cập nhật

Deploy toàn bộ source 2.12.1 lên Vercel. Không có SQL hoặc biến môi trường mới. Giữ các cấu hình xác thực hiện có.

## Nguyên nhân và thay đổi

Trước đây mọi sự kiện onAuthStateChange đều chuyển giao diện sang checking, kể cả SIGNED_IN lặp lại khi quay về tab. Điều này tháo toàn bộ workspace, làm mất form/chỉnh sửa đang mở; lỗi mạng lúc kiểm tra quyền lại bị trình bày như yêu cầu đăng nhập.

Bản mới giữ workspace khi kiểm tra nền cho cùng tài khoản đã được máy chủ xác nhận. Sự kiện focus/visibility/SIGNED_IN được gộp; kết quả thành công được dùng lại trong bộ nhớ tối đa 30 giây để tránh gọi trùng. Token đổi vẫn được xác minh nền. Không lưu cờ đã có quyền vào localStorage hoặc bỏ kiểm tra quyền API.

Đăng xuất và đổi tài khoản khóa workspace ngay. Kết quả từ tài khoản/token cũ không được mở lại màn hình. HTTP 403 khóa quyền; HTTP 401 thử làm mới token tối đa một lần trước khi yêu cầu đăng nhập lại. Kiểm tra quyền ban đầu phải thành công mới được hiện dữ liệu.

Lỗi mạng, 429 hoặc 5xx không tự đổi thành sai tài khoản/mật khẩu. Với cùng tài khoản vừa xác thực, lỗi tạm thời hiện thông báo và giữ màn hình trong khoảng gia hạn tối đa 5 phút từ lần xác nhận thành công; sau đó hiện màn hình Thử lại thay vì tự gọi là đăng xuất. Khi trang bị trình duyệt tạm ngưng, kiểm tra tiếp khi hoạt động trở lại. Tất cả thao tác API vẫn kiểm tra quyền độc lập. F5 vẫn phải xác minh lại trước khi hiển thị quản trị.

Endpoint admin/access phân biệt 401/403 với 503 do mạng hoặc cấu hình; không trả lỗi thô của nhà cung cấp hay token. Các API nghiệp vụ vẫn giữ cơ chế xác thực hiện có.

## Giao diện

- Sửa nguyên nhân icon link đè nội dung: selector padding chung có độ ưu tiên cao hơn selector ô có icon. Quy tắc mới dành riêng 48px đầu ô, căn icon giữa theo chiều dọc và không chặn thao tác chuột.
- Form sản phẩm trên điện thoại dùng một cột cho các cặp trường, nút lưu/đóng chia đều chiều rộng.
- Nhóm nút, chân thẻ và phân trang ngắt dòng khi thiếu chỗ; trường dài không đẩy cột form ra ngoài.
- Giữ bảng màu, font và các chức năng của 2.12.0.

## Tự kiểm tra sau deploy

1. Đăng nhập, mở sửa một sản phẩm và nhập thử nội dung chưa lưu.
2. Chuyển sang tab khác rồi quay lại nhiều lần: form vẫn mở, chữ vừa nhập vẫn còn.
3. Chuyển các route bằng menu, dùng Back/Forward: điều hướng vẫn đúng.
4. Kiểm tra ô affiliate ở màn hình nhỏ: chữ bắt đầu sau icon.
5. Đăng xuất: dữ liệu quản trị bị ẩn. F5 hoặc mở cửa sổ chưa đăng nhập không lộ kho hàng.
6. Nếu mất mạng: thông báo kết nối và nút Thử lại xuất hiện theo điều kiện ở trên, không coi đó là sai mật khẩu.

Kiểm thử cục bộ gồm điều khiển trạng thái xác thực, sự kiện đồng thời, refresh token bị từ chối, mạng lỗi, hết thời gian gia hạn, đổi tài khoản, đăng xuất và phản hồi máy chủ đến muộn; kiểm thử API quyền quản trị; hồi quy toàn bộ source và build. Chưa triển khai lên tài khoản thật và chưa kiểm tra trực quan bằng trình duyệt trong môi trường hiện tại.
