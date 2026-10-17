# Nếp 2.9.1 — sửa chênh lệch tạo thủ công và cron

## Các nguyên nhân tìm thấy trong source và ảnh

Ảnh thử thủ công chọn **Ngắn** (Facebook tối đa 260 ký tự). Cron mặc định **Siêu ngắn** (150 ký tự), nên một bản hợp lệ ở chế độ Ngắn có thể bị cron loại. Giới hạn được giữ đúng như lựa chọn; không tự đổi cron sang bài dài.

Trước bản vá, cron chỉ chờ AI 25–30 giây trong khi thủ công chờ 60 giây. Cả hai đều yêu cầu AI tạo đủ Facebook/Threads/Instagram dù cron chỉ dùng một kênh. Khi bài dài, retry dùng lại yêu cầu cũ mà không gửi bản trước và yêu cầu sửa cụ thể. Mọi lỗi, kể cả 503/timeout trước lúc đăng, đều tắt toàn bộ lịch. Đây là các điểm xử lý trong ứng dụng, không phải bằng chứng bạn điền sai khóa.

503 vẫn là lỗi dịch vụ của nhà cung cấp; không thể bảo đảm Google không còn trả 503. Bản vá xử lý lỗi đó đúng hơn và tránh gọi lặp lãng phí. Không có quyền đọc log Vercel/Supabase thực tế; kết luận kỹ thuật dựa trên ảnh và source, có kiểm thử tái hiện các đường lỗi.

## Đã sửa

- Chỉ yêu cầu AI viết kênh cần dùng; schema không còn bắt viết hai kênh thừa. Khi tạo thủ công nhiều kênh, vẫn nhận đủ các kênh đã chọn. Không đổi provider/model khi lỗi.
- Mặc định giao diện tạo thủ công cũng là Siêu ngắn. Bạn vẫn có thể chọn Ngắn; cron dùng độ dài đã lưu trong lịch.
- Prompt có mục tiêu thấp hơn trần và cấu trúc hai dòng. Chuẩn hóa khoảng trắng/xuống dòng mà không cắt bỏ nội dung. Giữ kiểm tra hook tối đa 70 ký tự, độ dài từng kênh, link affiliate nguyên gốc và thông báo hoa hồng.
- Bài không đạt: gửi chính bản trước và lỗi cụ thể để sửa một lần. Nếu vẫn không đạt, dừng lượt đó; không tiêu tốn đủ 5 lần chỉ vì bài dài. Không tự cắt câu có thể làm đổi nghĩa.
- Chờ mỗi request tối đa 60 giây như tạo thủ công, trong ngân sách tổng cron 300 giây. Khi thời gian còn lại ít, không cố gọi AI tiếp. Reel vẫn chừa thời gian cho Meta xử lý video.
- Lỗi quá tải/mạng thử tối đa 5 lần với khoảng chờ tăng dần 10/20/40/60 giây; ưu tiên Retry-After từ nhà cung cấp. Nếu thời gian không đủ để chờ, kết thúc lượt thay vì gọi quá sớm. Không có thử lại vô hạn.
- HTTP 400/401/403/404 dừng ngay, không cố gọi đủ 5 lần. Nội dung bị bộ lọc chặn không lặp để vượt bộ lọc.
- Tách rõ HTTP, timeout, mạng, JSON, định dạng và kiểm tra nội dung. HTTP thực được lưu vào cột http_status; hướng dẫn không còn quy mọi lỗi thành kiểm tra API key. Bỏ phần thought của Gemini trước khi đọc JSON.
- Lỗi AI tạm thời/chưa đạt nội dung: chưa gửi Meta, ghi nhật ký và kết thúc khung giờ với trạng thái Bỏ qua. **Giữ lịch bật cho giờ đã lưu kế tiếp**, không chạy lại cùng mốc mỗi phút và không đăng bù dồn dập.
- Sai khóa/model/cấu hình, lỗi database, token/quyền Meta, hoặc kết quả gửi Meta chưa rõ: vẫn tạm dừng để tránh chi phí/đăng trùng.
- Tắt lịch hoặc đổi cấu hình trong thời gian chờ sẽ chặn request AI tiếp theo. Lượt cũ bị ngắt trước khi có bài gửi không còn tự làm tắt lịch; nếu bài cũ đang gửi/chưa rõ kết quả thì vẫn dừng để xác minh.
- Kiểm tra cột post_format/video_id trong database trước khi gọi AI. Thiếu migration sẽ báo chạy reels.sql trước, không tạo nội dung rồi mới phát hiện không lưu được.
- Giữ một khóa AI cho cả chuỗi thử, chỉ lưu một bộ bản nháp khi hợp lệ. Ghi token biết được; nếu request lỗi khiến không xác định được tổng token, để trống thay vì đoán hoặc ghi 0.

## Cập nhật

1. Chép source mới vào gốc repository rồi deploy Vercel; giữ biến môi trường và Fluid Compute 300 giây.
2. Nếu đã chạy SQL đầy đủ của bản 2.9: **không cần SQL mới, không cần cài lại cron**. Nếu chưa từng chạy `supabase/reels.sql`, chạy file đó sau `automation-unrestricted.sql` và các migration cũ. Bản vá sẽ kiểm tra trước AI nếu còn thiếu cột.
3. Nếu lịch đang tắt vì lỗi cũ, vào Lịch tự đăng, kiểm tra model/độ dài, bật, xác nhận và Lưu **một lần**. Bản vá không tự bật lịch bạn đang chủ động tắt.
4. Theo dõi mốc tiếp theo: 503/timeout sẽ ghi Bỏ qua và Lịch vẫn bật; không cần tự bật lại sau mỗi lỗi tạm thời. Nếu lỗi sai khóa/quyền hoặc Meta chưa rõ kết quả, sửa nguyên nhân rồi mới bật lại.

Nếu còn hai file route cũ `app/automation/page.tsx`, `app/categories/page.tsx`, xóa chúng; giữ các trang trong `app/(admin)/`. Không xóa API.

Có thể thử thủ công cùng sản phẩm, model, kênh và **cùng độ dài** để so sánh tương đương. Không chỉ so Ngắn thủ công với Siêu ngắn của cron. Không cần gửi khóa API trong chat.

## Kiểm thử và giới hạn

Có test tái hiện Ngắn thành công/Tiny quá dài, sửa đúng bản trước, schema một kênh, chuẩn hóa nhiều dòng không gọi lại AI, tối đa hai bản khi sai độ dài, backoff/Retry-After, timeout/mạng/JSON riêng, dừng sớm với khóa/model lỗi, kiểm tra SQL trước khi gọi, giữ lịch khi AI lỗi và giữ chặn gửi lại Meta.

Chưa chạy thử bằng khóa AI thật hoặc sửa deployment đang chạy của bạn. Không cam kết không còn 503 hoặc số tiền tiết kiệm cụ thể. Các lần request lỗi vẫn có thể được nhà cung cấp tính quota; số lần đã biết và token quan sát được được ghi nhận trong phạm vi phản hồi API.

Tham chiếu chính thức về lỗi tạm thời/backoff:
https://ai.google.dev/gemini-api/docs/troubleshooting
