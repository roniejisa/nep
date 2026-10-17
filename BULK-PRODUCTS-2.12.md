# Nếp 2.12.0 — Duyệt và quản lý sản phẩm hàng loạt

## Cập nhật

Deploy source mới lên Vercel như các bản trước. Bản 2.12.0 **không thêm bảng hoặc migration SQL mới**. Nếu đang dùng 2.11.1 và đã chạy product-import.sql thì không cần chạy lại SQL. Nếu nâng từ bản chưa có import CSV, cài product-import.sql theo PRODUCT-IMPORT-2.11.md trước.

## Chuyển cả kho sang Sẵn sàng

1. Mở **Sản phẩm** (`/san-pham/`).
2. Bấm **Cho tất cả sẵn sàng**. Nút này dùng toàn bộ kho đang hoạt động, không chỉ 12 sản phẩm ở trang hiện tại và không khôi phục sản phẩm lưu trữ.
3. Hộp duyệt hiển thị số đủ điều kiện, số cần bổ sung và số thiếu ảnh. Mở danh sách để xem lý do từng sản phẩm; có phân trang.
4. Nếu CSV không có mô tả, có thể giữ lựa chọn **Dùng tên, shop và quy cách hiện có làm thông tin nguồn**. Chỉ những trường có dữ liệu mới được đưa vào mô tả nguồn; không gọi AI ở bước này, không thêm thành phần, công dụng, ưu đãi hay trải nghiệm chưa có. Mô tả do bạn sửa không bị ghi đè.
5. Xác nhận thông tin của nhóm, bấm **Sẵn sàng N sản phẩm**. Những dòng lỗi link/tên hoặc thiếu thông tin khi tắt lựa chọn ở bước 4 được bỏ qua và báo riêng. Dữ liệu CSV gốc, giá, ảnh, link affiliate, ghi chú không thay đổi.
6. Xem kết quả: đã cập nhật, đã đúng yêu cầu, cần xem lại. Có thể làm lại an toàn sau khi làm mới; sản phẩm đã đạt không bị ghi lại.

**Sẵn sàng là điều kiện của dữ liệu sản phẩm.** Không có nghĩa mọi tài khoản mạng xã hội đã kết nối, token còn hạn hay lịch đã bật. Với lịch đã bật, sản phẩm vừa duyệt có thể được chọn ở lượt tiếp theo nếu khớp nguồn/kênh/định dạng đã lưu.

## Làm riêng từng nhóm

- Dùng tìm kiếm, danh mục, trạng thái hoặc bộ lọc hoàn thiện. Các bộ lọc trạng thái cũng hiện trên màn hình nhỏ.
- Chọn từng thẻ/dòng, **Chọn trang này** hoặc **Chọn tất cả N kết quả lọc**. Chọn nhiều được giữ qua các trang phân trang; có cảnh báo nếu có mục đã chọn nằm ngoài bộ lọc hiện tại.
- Thao tác: Sẵn sàng, Đổi danh mục, Về Nháp, Lưu trữ. Có thể nhập tên danh mục mới. Nút Bỏ chọn xóa lựa chọn.
- Về Nháp/Lưu trữ không xóa dữ liệu hoặc bài đã đăng và không thu hồi yêu cầu đã gửi Meta. Không thêm xóa hàng loạt để tránh nhầm thao tác dọn ảnh/video.

## Kênh và ảnh/video

- Facebook/Threads: bài thường có thể chỉ có chữ.
- Instagram: bài thường cần ảnh được chọn; tự động bỏ qua sản phẩm không có ảnh.
- Reel: vẫn cần video đã tải và được xác nhận. Không dùng trạng thái Sẵn sàng để bỏ qua kiểm tra media.
- Thiếu ảnh không cản duyệt dữ liệu cho bài chữ. Hàng đợi lấy ảnh vẫn là tùy chọn độc lập.

## Sửa UX liên quan

- Thẻ và bảng sản phẩm có checkbox, lý do thiếu dữ liệu, nút sửa rõ ràng; sản phẩm có nhãn ready cũ nhưng thiếu dữ liệu được hiển thị Cần bổ sung.
- Thống kê chỉ đếm sản phẩm có trạng thái Sẵn sàng, đã xác nhận nguồn, đủ dữ liệu và link HTTPS hợp lệ.
- Trang Lịch tự đăng hiển thị đúng số đủ điều kiện trong nguồn đang chọn, có cảnh báo nguồn rỗng và đường dẫn về duyệt hàng loạt.
- Trang Nội dung AI chặn bấm tạo khi chưa có mô tả nguồn và chỉ đường về bước hoàn thiện, thay vì đợi API báo lỗi.
- Sau import CSV có bước tiếp theo rõ ràng về kho duyệt nhóm; thư viện ảnh hiện trạng thái đang tải; phân trang danh mục khóa khi đang lưu.

## Xử lý lỗi và quyền truy cập

API hàng loạt yêu cầu phiên quản trị giống các API riêng tư hiện có; chỉ nhận danh sách ID cụ thể của tối đa 1.000 sản phẩm, không nhận owner_id từ trình duyệt. Mọi truy vấn đều giới hạn tài khoản đã xác thực. Đọc theo lô và cập nhật tối đa 4 yêu cầu đồng thời, timeout mỗi truy vấn 20 giây. Nếu sản phẩm bị sửa/xóa sau lúc đọc, kiểm tra updated_at ngăn ghi đè và trả kết quả cần làm mới. Các sản phẩm lỗi/không còn thuộc tài khoản hoặc chưa kịp xử lý được báo riêng.

Nếu mất kết nối lúc lưu, làm mới kho trước khi thử lại. Không tự đăng bài hoặc gọi AI trong thao tác duyệt, không tự bật lịch.

## Kiểm tra bản bàn giao

Kiểm thử dữ liệu CSV 199 sản phẩm, lặp lại không ghi trùng, giữ mô tả đã sửa và mọi cột gốc, cách ly tài khoản, thay đổi đồng thời, lỗi một phần, đổi danh mục và trạng thái. Kiểm tra render dạng thẻ/danh sách, toàn bộ bộ kiểm thử cũ, TypeScript/build và các API riêng tư. Không thực hiện thay đổi trên Supabase hay tài khoản mạng xã hội thật. Chưa kiểm tra hình ảnh giao diện trong trình duyệt do môi trường không có trình duyệt.
