# Nếp 2.14.0 — Lượt lỗi không tự tắt lịch

## Cập nhật

Deploy toàn bộ source mới lên Vercel. Không có SQL hoặc biến môi trường mới. Giữ các migration đã cài, bao gồm automation-dense-schedule.sql nếu đang dùng bản 2.13.0.

**Nếu bản cũ đã tắt lịch:** vào Lịch tự đăng, bật lại Bật tự đăng theo lịch này, xác nhận và bấm Lưu lịch đăng một lần. Bản cập nhật không tự bật lại lịch đang tắt, vì không thể phân biệt chắc chắn lịch bị lỗi cũ với lịch bạn chủ động tắt sau khi chi tiết lỗi đã hết hạn.

## Ảnh lỗi được cung cấp

Ảnh chỉ cho thấy một lượt Threads mang nhãn Lỗi · đã dừng và chi tiết đã dọn sau 8 giờ. Không thể khôi phục nguyên nhân gốc từ ảnh đó. Code bản trước có nhánh tự ghi enabled=false khi gặp lỗi token, quyền, cấu hình, dữ liệu hoặc lỗi gửi Meta chưa rõ kết quả. Nhánh này đã được bỏ trong worker.

## Hành vi mới

- Lỗi một lượt (AI, token, quyền, quota, mạng, cấu hình hoặc dữ liệu): ghi vào Nhật ký lỗi, kết thúc lượt với trạng thái Đã bỏ qua. Không cập nhật enabled, không đặt lại mốc giờ hoặc tài khoản đích.
- Mốc tiếp theo vẫn được xét. Không thử đăng lại bài lỗi cũ; tạo bài mới cho lượt mới nếu dữ liệu và quyền đều hợp lệ. Không thêm vòng gửi Meta tự động khi kết quả chưa rõ.
- Token/quyền/đích đăng vẫn được kiểm tra trước AI. Khi token hỏng, lượt đó không gọi AI; cần sửa token/quyền thì kênh mới đăng thành công. Giữ lịch bật không làm token tự hết lỗi. Kênh khác hợp lệ không bị khóa toàn bộ bởi một bài cũ.
- AI vẫn giữ tối đa 5 lần thử trong một lượt, theo quy tắc retry hiện có. Lỗi khóa/model không hợp lệ vẫn không bị thử vô ích 5 lần ngay trong cùng lượt. Không tự chuyển sang AI hoặc tài khoản đích khác.
- Lỗi dọn nhật ký và lỗi ghi telemetry không tự hủy một lượt đang có thể tiếp tục. Ghi telemetry có timeout 5 giây, không lặp vô hạn.
- Thao tác chủ động tắt hoặc đổi cấu hình vẫn được kiểm tra trước mỗi lần gọi AI và trước khi đăng. Xóa danh mục đang được lịch chọn vẫn giữ hành vi xác nhận/tắt lịch của thao tác xóa; đây không phải lỗi của lượt cron.

## Bài đang gửi nhưng kết quả chưa rõ

Sau khi một lượt bị ngắt quá thời gian chờ, worker đối chiếu bài được liên kết:

- Đã published: đóng lượt cũ thành hoàn tất, không gửi lại.
- Còn draft hoặc chưa có bài: đóng lượt cũ, không lấy lại để tự đăng.
- publishing: đổi có điều kiện sang unknown (Cần xác minh), không đổi về draft.
- unknown hoặc không xác nhận được kết quả: giữ cách ly bài cũ, ghi cảnh báo và cho phép lượt mới xử lý bài mới. Nếu chưa cập nhật/đối chiếu được dữ liệu thì bỏ lượt hiện tại; không tắt lịch.

Giữ nguyên khóa một worker mỗi chủ sở hữu, unique claim theo mốc giờ và điều kiện chỉ publish từ draft. Nếu mất kết nối dữ liệu khiến không ghi được trạng thái kết thúc, bản ghi có thể còn Đang xử lý cho đến khi được đối chiếu sau timeout 10 phút. Lịch vẫn bật; không mở nhiều lượt AI song song để bù.

## Nhật ký và hiển thị

- Nhãn lịch sử failed cũ đổi thành Lượt bị lỗi, không dùng nhãn đã dừng để suy diễn trạng thái cả lịch. Badge Đang chạy/Đang tắt vẫn lấy từ enabled hiện tại.
- Lượt lỗi mới lưu dưới skipped với tóm tắt an toàn: loại lỗi, bước, kênh và mã HTTP/Meta nếu có. Không chép lỗi thô, link hoặc token vào tóm tắt.
- Chi tiết trong affiliate_automation_errors vẫn hết hạn sau 8 giờ và được dọn bởi cron hiện có. Tóm tắt mới còn theo thời gian lưu job hiện có (48 giờ), giúp nhìn lại loại/mã lỗi sau khi chi tiết hết hạn. Không khôi phục chi tiết đã xóa của lượt cũ.
- Khi không ghi được DB, phản hồi cron và log Vercel báo tình trạng; không giả vờ đã ghi nhật ký thành công. Log bootstrap chỉ ghi loại lỗi, mã và cờ cấu hình có/không, không in khóa. Khi thiếu service role/admin env thì không thể đảm bảo ghi lỗi vào chính DB đang không truy cập được.

## Kiểm tra sau deploy

1. Nếu lịch cũ đang tắt, bật và lưu lại một lần.
2. Quan sát lượt tiếp theo: lỗi có thể xuất hiện nhưng badge lịch vẫn Đang chạy.
3. Xem Nhật ký lỗi (8 giờ) để sửa token, quyền hoặc cấu hình cụ thể.
4. Với bài Cần xác minh, đối chiếu trên Meta; không bấm đăng lại cùng bài.
5. Tạm dừng bằng nút trên web: các lượt mới phải ngừng theo lựa chọn này.

Kiểm thử cục bộ gồm lỗi rồi lượt sau thành công, token/quyền/quota/mạng không tắt lịch, cách ly bài đang gửi, không gửi lại bài cũ, lỗi cleanup/telemetry, lỗi ghi kết quả, lỗi trước claim, dọn chi tiết 8 giờ nhưng giữ tóm tắt, quyền cron và hồi quy các bản trước. Chưa deploy hay truy cập tài khoản/Supabase thật.
