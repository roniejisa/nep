# Nếp 2.13.0 — Nhiều mốc đăng trong ngày

## Cập nhật

1. Chạy `supabase/automation-dense-schedule.sql` một lần trong SQL Editor, sau các migration đã cài (đặc biệt automation-unrestricted.sql và reels.sql). Có bản sao trong public cùng tên. Script có thể chạy lại an toàn.
2. Deploy toàn bộ source mới lên Vercel.
3. Vào **Lịch tự đăng** (`/automation/`), thêm mốc giờ hoặc tạo lịch nhanh, xác nhận cho phép tự đăng và bấm **Lưu lịch đăng**.

Không cần khóa mới, không cần tạo lại cron đã có. `nep-hourly-publish` đang chạy mỗi phút dù tên có chữ hourly. Cài mới hoàn toàn vẫn thực hiện các bước cron trong hướng dẫn cũ trước. SQL mới không tự bật lịch, không đổi tài khoản đích, AI, nội dung hay mốc giờ đã lưu. Một cột thời điểm bắt đầu được thêm để lần nâng cấp đầu không bất ngờ đăng bù các mốc cũ; chạy lại script không đặt lại cột này.

## Số mốc giờ

- Bỏ giới hạn 24 mốc ở giao diện, API và ràng buộc SQL. Bỏ khoảng cách bắt buộc 15 phút.
- Mỗi mốc dùng HH:MM theo giờ Việt Nam, không trùng trong ngày. Một ngày có 1.440 phút khác nhau; đây là độ chính xác của lịch hiện tại, không phải giới hạn bài/ngày do ứng dụng đặt ra. Không hỗ trợ nhiều mốc cùng một phút hoặc chính xác đến giây trong bản này.
- Ví dụ: mỗi 30 phút = 48 mốc; mỗi 15 phút = 96 mốc; mỗi phút = 1.440 mốc.
- Cột daily_limit của schema cũ còn để tương thích nhưng không được ghi lại từ form mới và không được dùng để giới hạn nhận job.

## Tạo lịch nhanh

Chọn mẫu 48/96 mốc hoặc mở **Tạo nhiều khung giờ nhanh**:

- Điền Từ giờ, Đến giờ, Cách nhau (phút). Ví dụ 07:00–23:00, mỗi 30 phút.
- Bấm Thêm vào lịch để gộp với lịch đang chỉnh, hoặc Thay toàn bộ bằng khoảng này để thay danh sách. Giờ kết thúc sớm hơn giờ bắt đầu nghĩa là khoảng qua nửa đêm.
- Có thể dán các giờ cách nhau bằng dấu phẩy, dấu chấm phẩy, khoảng trắng hoặc xuống dòng; mốc trùng được gộp.
- Thay đổi chỉ là bản đang chỉnh cho đến khi bấm Lưu lịch đăng.
- Danh sách có tìm kiếm và phân trang 24 mốc mỗi trang. 24 ở đây chỉ là kích thước trang hiển thị, không phải số lượng mốc được lưu. Định dạng riêng của từng mốc được giữ qua phân trang.

## Cron và chống trùng

SQL chọn mốc đã đến giờ sớm nhất chưa được nhận, thay vì chỉ lấy mốc gần nhất trong cửa sổ 5 phút. Mỗi chủ sở hữu vẫn chỉ có một lượt chạy đang hoạt động; cùng một mốc có unique claim nên không đăng lại khi cron gọi trùng. Mốc đã thành công, thất bại hoặc bỏ qua không tự chạy lại. Cơ chế kiểm tra bài có kết quả chưa rõ trên Meta vẫn giữ nguyên.

Mốc chờ được xét trong 24 giờ gần nhất, qua cả nửa đêm. Chỉ nhận mốc từ phút lưu lịch/bật lịch mới nhất và từ lần nâng cấp đầu; không đăng bù các giờ trước đó. Lưu lại cấu hình sẽ bỏ các mốc chờ cũ trước phút lưu. Mốc quá 24 giờ không được đăng bù vô hạn. Lịch window cũ vẫn giữ hành vi trước đây cho đến khi lưu sang danh sách mốc giờ.

Nhiều mốc không bảo đảm đăng đúng từng phút: AI, thời gian gửi Meta, video, token và hạn mức nền tảng vẫn quyết định tốc độ thực tế. Khi lượt trước chưa xong, các mốc còn hạn được xử lý lần lượt. Hệ thống không tăng số lượt AI chạy song song, không tự đổi AI trả phí, không tự thử gửi lại bài có kết quả chưa rõ.

## Kiểm tra sau triển khai

1. Tạo lịch mỗi 30 phút và lưu được 48 mốc; tải lại vẫn đủ.
2. Thêm hai mốc như 07:00 và 07:01. Cả hai được chấp nhận.
3. Tìm giờ và đổi trang: định dạng riêng vẫn còn.
4. Xem lịch sử job để xác nhận mốc được nhận một lần, lịch cũ và tài khoản đích vẫn đúng.

Kiểm thử cục bộ bao gồm 48/96/1.440 mốc, dán giờ, qua nửa đêm, backlog trễ quá 5 phút, claim duy nhất, giữ cài đặt khi chạy SQL lại, quyền RPC riêng tư và các hồi quy sẵn có. Chưa chạy SQL hay deploy lên tài khoản thật; chưa kiểm tra trực quan bằng trình duyệt trong môi trường hiện tại.
