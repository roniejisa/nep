# Nếp 2.0 — Cài đặt Instagram và Threads từng bước

Bản này được sửa từ nep.zip bạn gửi, giữ đường đăng Facebook Fanpage đã hoạt động. Hai kênh mới dùng token riêng. Không cần gửi bất kỳ token hoặc App Secret nào cho người khác.

## 1. Cập nhật website trước

1. Thay source trong repository GitHub kết nối Vercel bằng source mới. Giữ nguyên Environment Variables hiện có.
2. Supabase → SQL Editor → New query → mở `supabase/social-v2.sql`, dán toàn bộ và Run. Script này chạy sau content.sql đã có; thêm Instagram và thông tin ảnh/model, không xóa sản phẩm hoặc bài cũ. Không cần chạy lại schema.sql.
3. Vercel → project Nếp → Settings → Environment Variables. Giữ FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN và META_GRAPH_VERSION hiện tại vì bạn đã đăng được Facebook.
4. Thêm PUBLIC_SITE_URL bằng đúng URL Production, ví dụ https://ten-du-an.vercel.app (thay bằng URL của bạn). Không điền /admin, không dùng URL Preview được bảo vệ bằng đăng nhập.
5. Sau khi điền các biến cần thiết ở các phần sau, vào Deployments → chọn deployment → dấu ba chấm → Redeploy. Mọi lần đổi token/biến môi trường đều cần redeploy.
6. Mở Nếp → Kết nối & thiết lập → Kiểm tra biến môi trường. Link `/HUONG-DAN-META.html` trên website chứa hướng dẫn này để bạn mở lại.

## 2. Kết nối Instagram theo luồng Facebook Login

Cách trong bản source này là **Instagram API with Facebook Login**. Đừng trộn token của luồng Instagram Login trực tiếp vào đây. Tên menu có thể được Meta dịch hoặc sắp xếp khác; hãy tìm nhãn tiếng Anh đi kèm.

### A. Chuẩn bị tài khoản Instagram

1. Trên Instagram, mở hồ sơ → nút ba gạch → Cài đặt và hoạt động (Settings and activity).
2. Tìm Loại tài khoản và công cụ (Account type and tools) → Chuyển sang tài khoản chuyên nghiệp (Switch to professional account). Nếu đã là Business/Creator thì bỏ qua.
3. Chọn Business hoặc Creator và hoàn tất thiết lập. Tài khoản Personal không đủ điều kiện cho luồng xuất bản này.
4. Chuyển sang Fanpage Facebook bạn đang đăng thành công → Cài đặt (Settings) → Tài khoản được liên kết (Linked accounts) → Instagram → Kết nối (Connect account).
5. Đăng nhập đúng tài khoản Instagram và cấp các quyền được yêu cầu. Nếu tổ chức dùng Meta Business Suite, kiểm tra cả quyền của bạn trên Page và tài khoản Instagram trong Business Settings.

### B. Thêm khả năng Instagram trong ứng dụng Meta

1. Mở https://developers.facebook.com/apps/ → chọn ứng dụng Nếp đang dùng cho Facebook.
2. Vào Trường hợp sử dụng (Use cases) → Thêm trường hợp sử dụng (Add use case) hoặc thêm sản phẩm Instagram nếu dashboard dùng giao diện cũ.
3. Chọn khả năng truy cập/quản lý nội dung Instagram, không chỉ nhắn tin. Vào Customize / API setup và chọn Instagram API with Facebook Login nếu giao diện đưa ra hai lựa chọn đăng nhập.
4. Trong phần quyền, cần instagram_basic và instagram_content_publish. Luồng tìm Page dùng pages_show_list và pages_read_engagement. Nếu quản lý qua Business Manager, Meta có thể yêu cầu thêm quyền liên quan đến tài sản doanh nghiệp theo cấu hình thực tế.
5. Khi app còn Development, hãy thử với tài khoản có vai trò admin/developer/tester phù hợp và có quyền quản lý Page/Instagram. Muốn cung cấp ứng dụng cho tài khoản ngoài phạm vi vai trò có thể cần App Review/Advanced Access; trang chính sách không tự cấp các quyền này.
6. Nếu không thấy khả năng Instagram hoặc các quyền cần thiết trong app hiện tại, kiểm tra loại app/use case đang hỗ trợ; không dùng một token với các quyền nhắn tin thay cho quyền xuất bản. Dashboard quyết định khả năng nào có thể thêm cho app đó.

### C. Lấy Instagram User ID và token đúng

1. Mở https://developers.facebook.com/tools/explorer/.
2. Trong Meta App, chọn Nếp. Chọn phiên bản API đang dùng cho Facebook (ô vXX.0).
3. Lấy User Access Token của tài khoản Facebook có quyền quản lý Page và Instagram. Yêu cầu pages_show_list, pages_read_engagement, instagram_basic và instagram_content_publish. Trong màn hình cấp quyền, chọn đúng tài sản và chấp nhận đầy đủ quyền cần thiết.
4. Chọn phương thức GET, nhập đường dẫn sau vào thanh truy vấn rồi Submit:

```
/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}
```

5. Trong kết quả `data`, tìm mục có `name`/`id` đúng Fanpage bạn dùng. Ví dụ cấu trúc kết quả (đây chỉ là dữ liệu mẫu):

```json
{
  "id": "PAGE_ID",
  "name": "Tên Fanpage",
  "access_token": "PAGE_TOKEN_MOI_DA_CAP_QUYEN_INSTAGRAM",
  "instagram_business_account": {
    "id": "INSTAGRAM_USER_ID",
    "username": "tai_khoan_instagram"
  }
}
```

6. `instagram_business_account.id` → điền vào INSTAGRAM_USER_ID trên Vercel.
7. `access_token` của chính mục Page này → điền vào INSTAGRAM_ACCESS_TOKEN. Dùng biến riêng này để không cần đổi FACEBOOK_PAGE_ACCESS_TOKEN đang hoạt động. Đây là Page token mới có quyền Instagram, không phải App Secret và không phải User token ban đầu.
8. Giữ META_GRAPH_VERSION đang dùng. Điền PUBLIC_SITE_URL như phần 1, rồi redeploy.
9. Vào Nếp → Kết nối & thiết lập → Kiểm tra Instagram. Nếu hiện đúng username và ID, token đã đọc được đúng tài khoản. Điều này chưa chứng minh quyền đăng; bài thật vẫn cần bạn duyệt.

Nếu `instagram_business_account` không có/null: kiểm tra tài khoản đã là Professional, đã liên kết đúng Page, và quyền người dùng/token. Không tự lấy một số khác để thay. Nếu `data` trống: kiểm tra đúng user, quyền Page và các tài sản được chọn khi cấp quyền.

### D. Đăng bài Instagram đầu tiên

1. Trong Nếp → Sản phẩm, thêm ít nhất một ảnh sản phẩm. Ảnh vẫn được lưu WebP trong Supabase.
2. Vào Nội dung AI → chọn sản phẩm → bật Instagram → chọn một ảnh.
3. Chọn Ngắn hoặc Siêu ngắn, chọn góc mở đầu, rồi Tạo bài ngắn.
4. Mở tab Instagram → Xem trước, kiểm tra nội dung, ảnh, link và ID đích. Tick đồng ý, nhấn Đăng bài.
5. Server tạo JPEG vuông 1080×1080 với nền trắng khi Meta lấy ảnh. Không lưu thêm JPEG vào Storage. Link ảnh có chữ ký hết hạn sau một giờ; chỉ người có link trong thời gian hiệu lực mới lấy được ảnh.
6. Meta phải truy cập được PUBLIC_SITE_URL và endpoint ảnh từ internet. Production không được chặn bằng Vercel Authentication/Deployment Protection nếu Meta cần lấy ảnh. Không chuyển bucket Supabase sang public.
7. Bản này đăng một ảnh lên Feed, chưa đăng Reels, Stories hoặc carousel. Caption có URL affiliate nhưng Instagram thường không cho bấm link trực tiếp trong caption. Bạn cần tự thiết lập link mua ở bio hoặc dùng sticker link trong Story khi phù hợp; web không tự sửa bio.

## 3. Kết nối Threads

Threads dùng **Threads user token riêng**, không dùng Page token Facebook. Threads App ID và Threads User ID là hai thứ khác nhau.

### A. Chuẩn bị tester và tạo token

1. Meta Developers → ứng dụng Nếp → Trường hợp sử dụng → Truy cập API Threads (Access the Threads API) → Customize / API setup.
2. Nếu chưa có use case, chọn Add use case để thêm Threads API.
3. Vào Vai trò ứng dụng (App roles) → Vai trò / Additional roles → thêm Threads Tester, chọn tài khoản Threads muốn đăng.
4. Dùng tài khoản Threads đó chấp nhận lời mời. Tìm trong cài đặt quyền website/ứng dụng của Threads hoặc lời mời tester; vị trí có thể thay đổi theo phiên bản. Chưa chấp nhận lời mời thì token generator có thể không hoạt động.
5. Quay lại Threads API setup → User Token Generator / Generate Access Token. Chọn tester vừa thêm, đăng nhập Threads và cấp threads_basic + threads_content_publish.
6. Copy token về nơi lưu bí mật của bạn. Không chụp ảnh có token, không đưa token lên GitHub hoặc dán vào chat.
7. Nếu dashboard không có User Token Generator, cần dùng Authorization Window theo tài liệu chính thức để cấp quyền và đổi authorization code. Bản Nếp này chưa triển khai OAuth redirect/callback; không có một URL callback giả để điền. Đừng dùng Facebook Graph API Explorer để tạo Page token rồi coi đó là token Threads.

### B. Lấy Threads User ID

Dùng công cụ HTTP tin cậy như Postman trên máy của bạn:

1. Tạo request mới, phương thức GET.
2. URL:

```
https://graph.threads.net/v1.0/me?fields=id,username
```

3. Tab Authorization → chọn Bearer Token → dán token Threads vừa tạo vào ô token (không dán vào URL).
4. Send. Kết quả có `id` và `username`; kiểm tra username đúng tài khoản muốn đăng.
5. `id` → Vercel biến THREADS_USER_ID. Token → THREADS_ACCESS_TOKEN.
6. Redeploy. Trong Nếp → Kết nối & thiết lập → Kiểm tra Threads. Nếu token thuộc tài khoản khác ID, web sẽ báo để bạn sửa.
7. Vào Nội dung AI → bật Threads → tạo bài ngắn, xem trước, duyệt và đăng. Có thể đăng chỉ chữ hoặc đính kèm một ảnh. Tối đa 500 ký tự tính cả link và thông báo affiliate.

### C. Token hết hạn và tài khoản ngoài vai trò

Token ngắn hạn có thể hết hiệu lực sớm. Meta có cơ chế đổi sang long-lived token và gia hạn theo điều kiện của nền tảng; Nếp hiện chưa tự thực hiện các bước đó. Khi token hết hạn/thu hồi, tạo/cấp lại token phù hợp, thay biến trên Vercel và redeploy. Không giả định token nào tồn tại vĩnh viễn. Quản lý tài khoản ngoài vai trò thử nghiệm có thể cần App Review và quyền truy cập tương ứng.

## 4. Bảng biến mới và biến giữ nguyên

| Tên | Điền gì |
| --- | --- |
| FACEBOOK_PAGE_ID | Giữ ID Page đang hoạt động |
| FACEBOOK_PAGE_ACCESS_TOKEN | Giữ token Facebook đang hoạt động |
| META_GRAPH_VERSION | Giữ phiên bản API Facebook đang dùng |
| INSTAGRAM_USER_ID | instagram_business_account.id của Page đã liên kết |
| INSTAGRAM_ACCESS_TOKEN | Page access_token mới có quyền Instagram; server dùng token Facebook nếu để trống |
| THREADS_USER_ID | id tài khoản từ Threads /me |
| THREADS_ACCESS_TOKEN | User token Threads |
| PUBLIC_SITE_URL | URL Production công khai, HTTPS |
| GEMINI_API_KEY | Khóa AI Google nếu dùng Gemini |
| GEMINI_MODEL | Model ID đang dùng được, tùy chọn; cũng có thể nhập ở màn hình tạo bài |
| SOCIAL_IMAGE_SIGNING_SECRET | Tùy chọn: chuỗi bí mật ngẫu nhiên riêng cho chữ ký ảnh; nếu không điền, server dùng khóa server Supabase để ký theo ngữ cảnh riêng |

Không đổi SUPABASE_SERVICE_ROLE_KEY hoặc CONTENT_ADMIN_USER_ID nếu chúng đang hoạt động. Không dùng tiền tố NEXT_PUBLIC_ cho token/khóa server.

## 5. Bài ngắn và giao diện mới

- Mặc định Ngắn: phần AI viết tối đa Facebook 260, Threads 180, Instagram 300 ký tự, chưa tính link và thông báo affiliate hệ thống gắn.
- Siêu ngắn: lần lượt 150, 120, 180 ký tự.
- Dòng đầu tối đa 70 ký tự, yêu cầu AI hướng đến 6–12 từ. Tối đa 3 dòng có nội dung trước phần link.
- Chọn một góc: phiền toái thực tế, tò mò có căn cứ hoặc lợi ích rõ ràng. Web kiểm tra độ dài; nếu AI không tuân thủ sẽ báo lỗi thay vì lưu bài dài hoặc tự cắt mất ý.
- Bài cũ không bị sửa/xóa tự động. Bấm Tạo bản ngắn mới để tạo bản nháp thay thế, không tự đăng lại bài đã đăng.
- Nút Lưu giữ chỉnh sửa. Bật Xem trước để xem câu mở đầu nổi bật; ảnh xem trước hiển thị ảnh gốc, khi đăng Meta nhận JPEG vuông có thể thêm nền trắng.
- Chỉ một nhà cung cấp AI được gọi cho mỗi lượt. Tự động là chọn bên đầu tiên có khóa, không tự chuyển từ Gemini sang Claude/OpenAI khi lỗi/hết quota.

Ví dụ hướng câu mở đầu, chỉ dùng nếu khớp dữ kiện thật: “Mua nước giặt, bạn đang so giá hay so số lần giặt?” Sau đó một dữ kiện có trong mô tả và lời mời xem quy cách. Không dùng “rẻ nhất”, “sale sốc”, “sạch 100%” hoặc tự nhận đã dùng khi không có căn cứ.

## 6. Các lỗi thường gặp

- 401/403 hoặc Meta code 190: token không hợp lệ/hết hạn hoặc sai loại token. Cấp lại đúng luồng, điền đúng biến, redeploy.
- Meta code 10/200: kiểm tra quyền, vai trò trên app, quyền quản lý Page và Instagram. Đọc mã phụ trong thông báo nếu có.
- Không tải được ảnh / ảnh không hợp lệ: PUBLIC_SITE_URL phải là Production công khai, endpoint không bị chặn; ảnh nguồn phải còn tồn tại. WebP lưu trữ được server chuyển sang JPEG, không gửi thẳng WebP cho Instagram.
- Cần xác minh: Meta có thể đã nhận bài dù lưu lịch sử thất bại. Kiểm tra trực tiếp tài khoản và container_id trong Supabase trước khi xử lý; không reset status hàng loạt hoặc bấm gửi lại ở nơi khác.
- Khi đã xác nhận chắc chắn chưa đăng, quản trị viên mới đổi đúng bản ghi về draft để thử lại. Khi đã thấy bài, ghi đúng external_id và status published. Chỉnh trực tiếp DB chỉ dành cho quản trị viên hiểu kết quả kiểm tra.
- AI 429: kiểm tra quota/tier model trong Google AI Studio; không đồng nghĩa Gemini miễn phí vô hạn. Bản này không tự retry hoặc chuyển sang API khác.

## 7. Phạm vi kiểm chứng

Source được kiểm tra kiểu, build và test cục bộ cho chữ ký/hết hạn ảnh, chuyển WebP sang JPEG, chờ container, chặn publish khi thiếu ảnh/lỗi, giữ đường đăng Facebook chữ, migration giữ bài cũ và giới hạn bài ngắn. Chưa kiểm thử gửi bài thật bằng token Instagram/Threads của bạn; chưa xác nhận giao diện bằng browser tự động trong môi trường này. Bạn thực hiện lần đăng đầu sau cấu hình bằng nút duyệt.

## Tài liệu gốc để đối chiếu khi Meta đổi giao diện

- https://developers.facebook.com/documentation/instagram-platform/content-publishing
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/get-started
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram
- https://developers.facebook.com/documentation/threads/get-started
- https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions


## 8. Bản 2.1 — Các model Google trong ảnh bạn gửi

Model viết bài mới trong danh sách gợi ý: gemini-3.8-flash, gemini-3.5-flash-lite, gemini-3.1-pro-preview, gemini-3.6-flash và gemini-3.1-flash-lite. Vào Nội dung AI → AI viết bài: Google Gemini → ô Model, chọn hoặc nhập đúng ID. Tất cả dùng GEMINI_API_KEY; không cần mỗi model một API key. Model nào dùng được, free tier hay tính phí phụ thuộc quyền/model/tier dự án Google. Mặc định vẫn giữ Gemini 3.1 Flash-Lite, không tự đổi sang model trả phí.

Nano Banana 2 Lite (gemini-3.1-flash-lite-image) dùng riêng để tạo ảnh, không nằm trong danh sách viết bài. Cách dùng:
1. Chọn một sản phẩm đã có ảnh thật trong Nội dung AI.
2. Chọn ảnh tham chiếu ở phần Ảnh dùng khi đăng.
3. Mở Tạo ảnh sản phẩm với Nano Banana 2 Lite, mô tả bối cảnh muốn tạo.
4. Nhấn Tạo & lưu ảnh WebP. Request gửi ảnh đang chọn và mô tả sang Google. Có thể phát sinh phí API tạo ảnh; không có tự động retry hoặc chuyển model.
5. Ảnh tạo thành công được lưu trong ảnh sản phẩm, tự chọn để bạn xem và dùng khi đăng. Kiểm tra chữ, logo và chi tiết bao bì vì AI có thể làm sai; hệ thống không bảo đảm giữ nguyên tuyệt đối hình dáng sản phẩm. Chưa có bài nào tự đăng khi tạo ảnh.

Biến tùy chọn GEMINI_IMAGE_MODEL mặc định là gemini-3.1-flash-lite-image. Dùng GEMINI_API_KEY hiện có, không cần key riêng. Đổi biến trên Vercel cần redeploy. Nếu đã chạy social-v2.sql thì bản 2.1 không cần SQL mới. Tạo ảnh và viết bài dùng chung giới hạn 30 lượt/24h và chỉ một tác vụ AI chạy tại một thời điểm; giới hạn Google có thể thấp hơn. Tối đa 12 ảnh/sản phẩm, ảnh WebP đầu ra dưới 2 MB và cạnh dài không quá 1600px.

Nếu Google trả ảnh nhưng lưu Storage thất bại, API vẫn có thể tính phí. Kiểm tra thông báo trước khi tự bấm tạo lại. Khi server bị dừng và một lượt AI kẹt running, dùng quy trình quản trị trước đó để kiểm tra request đã dừng rồi sửa đúng bản ghi; không reset các lượt đang chạy.

Tính năng mới gửi ảnh tham chiếu sản phẩm đến Google; hãy cập nhật nội dung chính sách quyền riêng tư công khai trong Thiết lập để phản ánh việc xử lý này nếu trang đã được chỉnh/lưu trước đó.

Tài liệu model ảnh: https://ai.google.dev/gemini-api/docs/generate-content/image-generation
Danh sách model: https://ai.google.dev/gemini-api/docs/models
Giá và hạn mức: https://ai.google.dev/gemini-api/docs/pricing
