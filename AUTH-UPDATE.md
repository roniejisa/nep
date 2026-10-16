# Bản cập nhật khóa quản trị

Chưa đăng nhập: chỉ hiện màn hình đăng nhập, không dựng menu, form, bảng dữ liệu hay tải dữ liệu quản trị. Máy chủ phải xác nhận tài khoản trùng `CONTENT_ADMIN_USER_ID` trước khi mở quản trị. Không chấp nhận chỉ có session lưu trong trình duyệt.

Đăng xuất hoặc sự kiện phiên thay đổi sẽ khóa và hủy workspace hiện tại. Phiên đang mở được kiểm tra lại mỗi 60 giây và khi quay lại tab; nếu xác minh lỗi sẽ khóa. API quản trị vẫn kiểm tra quyền mỗi yêu cầu, không chờ chu kỳ này.

5 link khởi tạo được chuyển từ bundle phía trình duyệt sang API chỉ quản trị viên có quyền đọc. Mật khẩu không được log hoặc lưu vào database ứng dụng.

## Cập nhật lên Vercel

1. Chép nội dung thư mục `nep/` từ ZIP vào gốc repository hiện có.
2. Nếu còn hai file `app/automation/page.tsx` và `app/categories/page.tsx`, xóa chúng. Giữ hai file tương ứng dưới `app/(admin)/` và giữ nguyên `app/api/automation`.
3. Giữ các biến môi trường hiện có. Bắt buộc có `CONTENT_ADMIN_USER_ID` (UUID tài khoản quản trị trong Supabase Authentication → Users) và `SUPABASE_SERVICE_ROLE_KEY` trên server. Không đặt tiền tố `NEXT_PUBLIC_` cho hai biến này. Không gửi khóa bí mật vào chat.
4. Commit/push và chờ Vercel deploy thành công. Không cần migration SQL mới cho bản này.
5. Mở cửa sổ ẩn danh vào `/san-pham/`, `/automation/`, `/categories/`, `/cai-dat/`: chỉ hiện đăng nhập. Đăng nhập đúng quản trị viên, thử đổi trang rồi đăng xuất; giao diện phải khóa lại.

Các trang chính sách, liên hệ, OAuth callback, ảnh chia sẻ qua URL ký có thời hạn và cron có khóa xác thực vẫn giữ chức năng cần thiết. Nội dung công khai và mã JavaScript/CSS của web không thể coi là bí mật. Dữ liệu riêng được bảo vệ bằng quyền API và RLS, không dựa vào việc giấu menu.

Đã kiểm thử local quyền database theo schema trong source; chưa xác minh trực tiếp RLS, bucket và biến môi trường trên dự án Supabase/Vercel đang chạy của bạn. Kiểm thử trình duyệt thực tế với tài khoản của bạn cần thực hiện sau deploy.
