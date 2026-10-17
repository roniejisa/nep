# Nếp 2.10.1 — Đồng nhất lề giao diện quản trị

Ảnh báo lỗi cho thấy các khối của Nội dung AI tự cộng padding/margin khác nhau: Định dạng sát mép, Kênh/Ảnh lùi 24px, các mục mở rộng hết chiều ngang, phần ảnh AI cộng thêm lề trong một khung đã có lề.

Bản này đưa lề về một nơi: `composer-fields` sở hữu padding và gap; các khối trực tiếp không tự cộng thêm lề. Các mục mở rộng dùng cùng lề tiêu đề/nội dung; phần ảnh AI bỏ margin bị cộng hai lần. Thanh Tạo bài giữ nền phủ hết đáy khung và nút thẳng hàng với nội dung phía trên.

Áp dụng thêm cùng lề trong card cho tiêu đề, tìm kiếm, bộ lọc, danh sách sản phẩm và thư viện ảnh. Thiết lập bỏ margin giữa các mục mở rộng khi khung cha đã có gap. Không đổi màu, font, bóng, viền, nội dung hoặc luồng đăng bài/cron.

## Chuẩn khoảng cách

- Lề trang: 16px mobile, 24px tablet, 32px desktop.
- Lề card/form: 16px mobile, 24px từ tablet trở lên.
- Giữa các khối chính: 24px; giữa các trường: 16px; nhãn và input: 8px.
- Dùng token trong `app/spacing.css`; không thêm thư viện.

## Cập nhật

1. Giải nén source, cập nhật repository đang deploy rồi deploy lại trên Vercel.
2. Nếu đang dùng 2.10.0 và đã chạy `affiliate-placement.sql`, bản này không cần SQL, API key hoặc cấu hình cron mới.
3. Nếu chưa cập nhật 2.10, làm thêm các bước SQL/quyền bình luận trong `AFFILIATE-PLACEMENT-2.10.md`.
4. Sau deploy, tải lại trang. Kiểm tra Nội dung AI khi chọn sản phẩm và mở các mục tùy chọn; đổi sang Thiết lập, Sản phẩm và Thư viện để đối chiếu lề.

Đã kiểm tra routing/spacing bằng bộ kiểm thử có sẵn và build production. Môi trường hiện tại thiếu Chromium executable, nên chưa xác nhận bằng ảnh chụp trình duyệt ở 375/768/1280px; cần đối chiếu thêm trên bản deploy. Không chỉnh cổng đăng nhập hoặc dùng dữ liệu tài khoản thật để kiểm tra.
