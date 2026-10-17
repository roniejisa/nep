# Nếp 2.11.0 — Nhập sản phẩm Shopee hàng loạt

## Kết quả phân tích hai CSV đã gửi

- Mỗi file có 100 dòng; tổng 200 dòng, 199 mã khác nhau.
- Mã `14287246784` có trong cả hai file, giữ dòng hợp lệ đầu tiên và báo dòng sau bị trùng.
- Cột có sẵn: Mã sản phẩm, Tên sản phẩm, Giá, Doanh thu, Tên cửa hàng, Tỉ lệ hoa hồng, Hoa hồng, Link sản phẩm, Link ưu đãi.
- Không có ảnh hoặc mô tả. Không thể suy ra URL ảnh từ mã sản phẩm đơn thuần.
- Giá `98,6k` được đọc là 98.600; `1,4tr` là 1.400.000. Đây là giá tham khảo đã được nguồn rút gọn, không phải cam kết giá thanh toán. Cột Doanh thu được giữ dạng chuỗi gốc, không tự suy diễn thành doanh thu tiền hoặc số lượng bán.

## Cài đặt bản mới

1. Trong SQL Editor, chạy `supabase/product-import.sql` sau các migration hiện có, đặc biệt `automation-flex.sql`. Script thêm định danh Shopee, chống trùng, hàng đợi ảnh và giới hạn 12 ảnh trong DB; không xóa/ghép sản phẩm cũ.
2. Deploy source mới lên Vercel.
3. Muốn đóng tab vẫn lấy ảnh, chạy thêm `supabase/product-import-schedule.sql`. Script dùng lại Vault `nep_cron_secret` và `CRON_SECRET` đã cài, tạo job riêng `nep-product-images`, không sửa job đăng bài hay bật lịch đăng bài.
4. Vào **Sản phẩm → Nhập CSV & lấy ảnh hàng loạt**, đường dẫn `/san-pham/nhap/`.
5. Chọn cả hai CSV cùng lúc, kiểm tra danh sách xem trước và danh mục, tích xác nhận rồi nhập. Sản phẩm mới là **Nháp**, chưa xác minh nguồn, chưa được cron đăng.
6. Xem hàng đợi ảnh. Nút **Chạy hàng đợi ảnh** xử lý liên tiếp khi trang đang mở; nút dừng chỉ dừng vòng xử lý của tab sau lượt hiện tại. Cron ảnh đã cài vẫn làm việc độc lập.
7. Về kho, lọc **Chưa có ảnh** hoặc **Cần mô tả / kiểm tra nguồn**. Bổ sung mô tả thật, kiểm tra nguồn rồi chuyển sang Sẵn sàng theo luồng hiện có.

Chọn lại cùng CSV hoặc nhập lại sau mất kết nối đều an toàn: mã đã có được bỏ qua. Phản hồi mất giữa chừng có thể để một phần đợt đã nhập; nhập lại để tiếp tục, không cần xóa sản phẩm vừa nhập.

## Ảnh được lấy như thế nào?

- Khi CSV có cột tùy chọn `Link ảnh`, `Ảnh sản phẩm` hoặc `Image URL`: lấy trực tiếp ảnh CDN Shopee đã cho phép. Nhiều URL phân cách bằng `|`, tối đa 6 ảnh. Hệ thống kiểm tra lại host sau mỗi chuyển hướng, định dạng ảnh thật và kích thước tải.
- Nếu không có cột ảnh: đọc trang nguồn canonical `/product/shopId/itemId`, lấy Open Graph/JSON-LD khi trang xác nhận đúng mã sản phẩm. Không lấy ảnh đề xuất của sản phẩm khác, không chạy JavaScript, không vượt CAPTCHA/đăng nhập hoặc dùng proxy để né chặn.
- Shopee có thể không trả metadata, có thể trả HTTP 403/429 hoặc yêu cầu trình duyệt. Khi đó hàng đợi báo lý do; không báo thành công giả hoặc dùng ảnh AI thay thế. Chưa xác nhận lấy ảnh thực tế thành công cho toàn bộ 199 sản phẩm.
- Ảnh hợp lệ được chuyển thành **WebP**, cạnh dài tối đa 1.600px, không phóng to ảnh nhỏ; thử chất lượng 84/78/72 với mục tiêu khoảng 450 KB, trần 2 MB. Lưu trong bucket ảnh riêng tư hiện có.
- Mặc định lấy một ảnh; có thể chọn 1/3/6. Lượt nhập không thay ảnh sẵn có, không tự đổi ảnh bìa đã chọn.
- Không gọi AI để nhập sản phẩm hoặc lấy ảnh. Không cần API key AI hay khóa Shopee mới cho cách đọc metadata công khai này. Nếu Shopee chặn dữ liệu, cần nguồn URL ảnh hợp lệ hoặc các file ảnh để hoàn thiện.

## Bổ sung ảnh hàng loạt khi trang nguồn không trả ảnh

Ở cuối trang nhập, mở **Bổ sung nhiều ảnh bằng tên file chứa mã sản phẩm**. Đặt tên ví dụ:

```
16765092719.jpg
16765092719_1.png
16765092719_2.webp
```

Chọn tối đa 200 ảnh/đợt. Trước khi tải, giao diện hiển thị file nào khớp đúng một sản phẩm. File không khớp không được đưa sang sản phẩm khác. Ảnh được nén WebP tại trình duyệt rồi kiểm tra phía server. Nội dung ảnh đã nhập có fingerprint và tên lưu cố định để tránh thêm bản sao khi mất phản hồi/nhập lại. Giới hạn 12 ảnh áp dụng cả thao tác đồng thời từ nhiều tab. Không nhận ZIP trong bản này; có thể chọn nhiều file JPG/PNG/WebP cùng lúc.

## Quy tắc chống trùng và dữ liệu cũ

- Khóa: chủ sở hữu + Shopee + mã sản phẩm dạng chuỗi, không đổi sang số JavaScript.
- Kiểm tra mã phải khớp link nguồn, tách được cả mã shop. Một ID nhưng shop không khớp sẽ bị báo cần kiểm tra.
- Preview gộp nhiều CSV. Commit xác minh lại phía server, có khóa DB và unique index, không dựa riêng vào kiểm tra ở trình duyệt.
- Sản phẩm đã có giữ nguyên tên, giá, mô tả, danh mục, trạng thái, xác minh và link đã chỉnh. Có thể gắn mã còn thiếu nếu khớp link nguồn/link ưu đãi; có thể xếp hàng lấy ảnh còn thiếu.
- Khi thêm một cột Link ảnh mới rồi nhập lại, hàng đợi lỗi được cập nhật URL ảnh mới, không tạo sản phẩm mới. Nhập lại cùng file không liên tục thử lại trang bị chặn.
- Migration nhận diện mã từ link nguồn Shopee có sẵn. Nếu kho cũ đã có nhiều bản ghi cùng link nguồn, chỉ một bản được gắn mã tự động; không xóa hay ghép lịch sử. Lượt nhập phát hiện nhiều bản khớp sẽ báo cần xử lý thủ công.
- Nếu sản phẩm cũ chỉ có link rút gọn khác với CSV và không có link nguồn/mã, không thể khẳng định là cùng sản phẩm. Hãy bổ sung link nguồn có mã cho các mục “Chưa xác định mã sản phẩm” trước khi nhập để tránh bản sao của dữ liệu cũ chưa định danh.
- Kho hiện có giới hạn tải 1.000 sản phẩm từ các phiên bản trước. Preview báo dung lượng còn lại; import ngừng thêm mới ở mức này để không tạo kho mà giao diện không đọc hết. Nhập CSV tối đa 1.000 dòng/đợt, 10 file và tổng 2 MB. Hai file 199 mã của bạn nằm trong giới hạn nếu kho còn đủ chỗ.

## Hàng đợi, lỗi và bảo vệ dữ liệu

Job ảnh là một bản ghi mỗi sản phẩm, có trạng thái, số lượt và thông báo lỗi. Mỗi chủ sở hữu chỉ có một lease đang làm; job bị ngắt được nhận lại sau 3 phút tối đa một lần, có fingerprint để không tải trùng file đã lưu. HTTP bị chặn không tự retry vô hạn; dùng Thử lại ảnh khi đã kiểm tra nguồn hoặc bổ sung URL/file.

Cron xử lý tối đa 5 sản phẩm/lượt, theo ngân sách 45 giây, chạy mỗi phút khi có việc. Hàng đợi không liên quan enabled của lịch đăng. Chi tiết lỗi ảnh và log cron ảnh cũ được dọn sau 8 giờ khi cron ảnh được cài; trạng thái mỗi sản phẩm được giữ lại, không sinh log vô hạn. Xóa sản phẩm sẽ xóa hàng đợi tương ứng, tiếp tục dùng quy trình dọn Storage của kho hiện có.

API nhập, xem hàng đợi, upload đều kiểm tra đăng nhập quản trị. API cron kiểm tra CRON_SECRET. RLS chỉ cho chủ sở hữu đọc hàng đợi; thao tác hàng đợi/RPC chỉ server. Không có khóa bí mật trong CSV hoặc source frontend.

## Kiểm chứng

Đối chiếu chính hai file: 200 dòng → 199 sản phẩm hợp lệ, một dòng trùng, không dòng lỗi sau xử lý định dạng giá. Kiểm thử gồm parser, nguồn ảnh/redirect bị chặn, WebP, nhập lặp, unique/RLS, lease bị ngắt, không ghi đè ảnh và phản hồi DB không chắc chắn. Build/kiểm tra API riêng tư được thực hiện cục bộ; chưa chạy migration, nhập vào Supabase hoặc tải ảnh trên tài khoản triển khai thật của bạn.
