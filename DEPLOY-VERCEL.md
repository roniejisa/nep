# Nếp 1.1 — Nội dung AI, Facebook Page và Threads

Bản này chạy Next.js server trên Vercel. Không dùng static export: các API giữ khóa bí mật phía server. Source không chứa API key AI, service-role key hoặc token Meta.

## Cập nhật bản đang chạy
1. Thay source trong repository Vercel bằng nội dung ZIP này. Giữ dữ liệu và ảnh Supabase hiện tại.
2. Chạy `supabase/content.sql` trong Supabase SQL Editor một lần. Script tạo thêm hai bảng, không xóa bảng sản phẩm/ảnh. Có thể chạy lại script này.
3. Trong Vercel Project > Settings > Environment Variables, thêm các biến bên dưới cho Production. Nếu muốn thử trên Preview, cấu hình riêng môi trường đó.
4. Framework: Next.js. Install: `npm ci`. Build: `npm run build`. Xóa mọi override Output Directory = `out`; để mặc định Next.js. Node.js 22.x. Redeploy sau khi thay biến môi trường.
5. Đăng nhập bằng tài khoản Supabase hiện có, mở **Nội dung AI**.

## Biến môi trường phía server
| Tên | Giá trị |
| --- | --- |
| SUPABASE_SERVICE_ROLE_KEY | Service-role key của đúng dự án Supabase đang lưu sản phẩm. Đây là khóa bí mật; chỉ đặt phía server. |
| CONTENT_ADMIN_USER_ID | UUID tài khoản của bạn trong Supabase Authentication > Users, không phải project ID. Chỉ UUID này được dùng AI/đăng lên các tài khoản Meta cấu hình bên dưới. |
| GEMINI_API_KEY | Khóa miễn phí từ Google AI Studio (https://aistudio.google.com/apikey). Được thử đầu tiên. |
| GEMINI_MODEL | Tùy chọn, mặc định `gemini-3.1-flash-lite`. |
| ANTHROPIC_API_KEY / ANTHROPIC_MODEL | Tùy chọn, dự phòng Claude (mặc định `claude-haiku-5-5`). |
| OPENAI_API_KEY / OPENAI_MODEL | Tùy chọn, dự phòng ChatGPT (mặc định `gpt-4.1-mini`). |
| AI_PROVIDER_ORDER | Tùy chọn, mặc định `gemini,anthropic,openai`. |
| FACEBOOK_PAGE_ID | ID Fanpage muốn đăng, không phải ID tài khoản Facebook cá nhân. |
| FACEBOOK_PAGE_ACCESS_TOKEN | Page access token có quyền đăng lên đúng Page. |
| META_GRAPH_VERSION | Phiên bản Graph API đang được Meta app của bạn hỗ trợ, dạng `v25.0`. |
| THREADS_USER_ID | ID tài khoản Threads lấy qua Threads API. |
| THREADS_ACCESS_TOKEN | User access token cho đúng tài khoản Threads, có quyền xuất bản. |

Không dùng tiền tố NEXT_PUBLIC_ cho bất kỳ biến nào ở bảng trên. Không commit `.env.local`, không dán khóa vào chat. Để chạy local: copy `.env.example` thành `.env.local`, điền trên máy của bạn, chạy `npm ci` rồi `npm run dev`.

## Cấu hình Meta
Ảnh dashboard có mục Threads API không có nghĩa là token/quyền đăng đã sẵn sàng.

- Facebook: dùng Pages API và Page access token của người có quyền tạo nội dung trên Page; cần quyền `pages_manage_posts` và các quyền đọc Page liên quan như `pages_read_engagement`. `pages_show_list` dùng khi lấy danh sách Page/token qua luồng người dùng.
- Threads: cần `threads_basic` và `threads_content_publish`; người thử nghiệm phải được thêm/chấp nhận vai trò phù hợp khi app còn Development.
- App Review/access level phụ thuộc tài khoản và phạm vi sử dụng. Bản này cấu hình thủ công cho một quản trị viên và hai tài khoản đích; chưa có OAuth kết nối nhiều khách hàng hoặc tự gia hạn token.
- Token hết hạn/thu hồi cần cập nhật trên Vercel và redeploy. Trạng thái “Đã điền cấu hình” trên giao diện không chứng minh token hợp lệ.

Tài liệu: https://developers.facebook.com/documentation/pages-api/posts và https://developers.facebook.com/documentation/threads/posts
OpenAI: https://developers.openai.com/api/docs/guides/structured-outputs

## Cách dùng
1. Lưu tên và mô tả có căn cứ của sản phẩm; bản này không tự tra cứu Shopee.
2. Mở Nội dung AI, chọn sản phẩm và nhấn Tạo nội dung AI.
3. AI trả hai bản và nhận xét rà soát trong một lần gọi. Không có bộ chấm độc lập hoặc cam kết tương tác. Nhận xét áp dụng cho bản gốc, không cập nhật theo chỉnh sửa.
4. Sửa bài nếu cần. Lưu chỉnh sửa để giữ qua lần mở trang tiếp theo. Giữ link affiliate và dòng thông báo hoa hồng.
5. Đọc ID tài khoản đích. Tick xác nhận và nhấn Duyệt & đăng riêng cho từng kênh. Bài đi công khai ngay khi Meta chấp nhận, không phải bản nháp trên Meta.
6. Lịch sử lưu mã bài từng kênh. Một kênh thành công không có nghĩa kênh còn lại đã đăng.

Bản này đăng văn bản và link. Chưa đính kèm ảnh sản phẩm, đăng hẹn giờ, đăng Facebook cá nhân, tự chọn giờ tối ưu hoặc tự xuất bản không có lượt duyệt.

## Hạn mức và xử lý lỗi
- 30 lượt AI trong 24 giờ trượt, gồm cả lượt lỗi đã được ghi nhận. Mỗi quản trị viên chỉ một lượt AI chạy tại một thời điểm.
- Một request AI: tối đa 2.200 token đầu ra; input tên/mô tả bị giới hạn độ dài; timeout 60 giây. Usage token ghi trong bảng affiliate_content_runs khi thành công. Đây không phải số dư tín dụng API; cấu hình ngân sách thêm tại nhà cung cấp.
- Nếu tiến trình bị Vercel dừng trước cleanup, lượt `running` có thể bị kẹt. Sau khi chắc chắn request đã dừng (chờ ít nhất 10 phút), quản trị viên có thể sửa đúng bản ghi đó sang `failed` trong Supabase Table Editor. Không sửa lượt đang hoạt động.
- Đăng bài dùng claim nguyên tử theo ID bản nháp. Bấm hai lần hoặc hai tab không gửi cùng bản nháp hai lần.
- Khi timeout/lỗi không xác định: trạng thái `unknown` hoặc `publishing` bị khóa gửi lại. Kiểm tra trực tiếp tài khoản Meta trước. Nếu bài đã đăng, ghi đúng external_id và status published trong Supabase; nếu đã xác nhận chắc chắn chưa đăng, quản trị viên có thể đổi đúng bản ghi về draft để thử lại. Không reset hàng loạt.
- Không có giao dịch xuyên Meta và Supabase: Meta có thể đăng thành công nhưng lưu lịch sử thất bại. Vì vậy trạng thái chưa xác nhận không được tự retry.

## Kiểm chứng
`npm run typecheck`, `node --test tests/*.test.mjs`, `npm run build`.
Các test kiểm tra link/độ dài, RLS, chặn sửa trạng thái từ browser, khóa lượt AI và claim đăng bài chỉ một lần, cùng bộ test upload cũ.
Chưa thử tạo bài bằng khóa thật, chưa gửi bài thật đến Meta, chưa kiểm thử giao diện bằng browser trong môi trường bàn giao. Cần kiểm tra bằng tài khoản của bạn sau cấu hình. Không có quyền truy cập Vercel/Supabase/Meta của bạn để tự điền các khóa.

## Trang công khai cho Meta — bản 1.1.1
Các route riêng, không yêu cầu đăng nhập ứng dụng:
- `/privacy-policy/`: chính sách quyền riêng tư.
- `/terms-of-service/`: điều khoản dịch vụ.
- `/data-deletion/`: hướng dẫn yêu cầu xóa dữ liệu qua email, KHÔNG phải endpoint callback.
- `/contact/`: liên hệ quản trị viên.

Email liên hệ lấy từ ảnh cấu hình Meta: roniejisa@gmail.com. Từ bản 1.2, chỉnh email tại Thiết lập → Thông tin & nội dung website; mặc định nằm trong lib/site-defaults.json. Chủ ứng dụng cần kiểm tra email này hoạt động và thực hiện các yêu cầu dữ liệu được gửi đến. Bản này không có hệ thống gửi email/ticket tự động.

Sau redeploy, mở Thiết lập > Đường dẫn cho Meta tại tên miền Production để sao chép URL đầy đủ. Đừng dùng URL Preview hoặc tên miền được bảo vệ bằng đăng nhập Vercel. Kiểm tra từng trang bằng cửa sổ ẩn danh; trang phải tải được công khai và không trả lỗi 404.

Trong Meta Basic Settings:
- App Domains: hostname Production, không có https:// hoặc phần đường dẫn.
- Privacy Policy URL: URL đầy đủ kết thúc bằng /privacy-policy/.
- Terms of Service URL: URL đầy đủ kết thúc bằng /terms-of-service/.
- User Data Deletion: chọn Data Deletion Instructions URL rồi dùng URL kết thúc bằng /data-deletion/.

Các trang được tạo theo tính năng hiện tại, không phải chứng nhận pháp lý hoặc bảo đảm Meta xét duyệt. Biểu tượng ứng dụng và hạng mục còn thiếu trong ảnh là hai mục cấu hình riêng, không phải trang web.

### Quy trình quản trị khi nhận yêu cầu xóa
Xác minh quyền sở hữu trước khi xử lý. Xác nhận phạm vi và thời gian dự kiến với người gửi. Nếu xóa toàn bộ, kiểm tra các object Storage của user trước khi xóa tài khoản, dọn ảnh và dữ liệu liên quan (sản phẩm/ảnh, nội dung, lượt AI), sau đó xóa tài khoản Auth nếu nằm trong phạm vi yêu cầu. Không chỉ xóa sản phẩm vì lịch sử nội dung có thể vẫn tồn tại. Kiểm tra lỗi và phần dữ liệu còn lại; gỡ token server tương ứng và thu hồi quyền Meta nếu cần. Thông báo kết quả và các giới hạn lưu giữ thực tế, không hứa xóa bản sao lưu chưa kiểm chứng. Bài đã đăng cần được xử lý riêng trên Meta. Không thực hiện xóa chỉ vì người gửi biết email/ID của tài khoản.

## Bản 1.2 — chỉnh thông tin và hướng dẫn khóa trong quản trị

1. Cập nhật source và chạy thêm `supabase/site-settings.sql`.
2. Cấu hình `SUPABASE_SERVICE_ROLE_KEY` và `CONTENT_ADMIN_USER_ID` trên Vercel, redeploy. UUID quản trị được hiển thị trong Thiết lập khi bạn đăng nhập.
3. Vào Thiết lập → Thông tin & nội dung website. Có thể sửa tên, khẩu hiệu, mô tả SEO, email liên hệ, ngày chính sách, chân trang, tiêu đề/mô tả 4 màn hình và tiêu đề/nội dung 4 trang công khai. Bấm Lưu; tải lại trang công khai để xem nội dung mới. Không cần redeploy cho các nội dung này.
4. Mục Kết nối AI, Facebook & Threads chỉ dẫn nơi lấy và điền từng biến. Bấm kiểm tra để xem biến nào còn thiếu. Kiểm tra này không gọi AI/Meta, không đăng bài và không xác nhận hiệu lực token.

Thông tin công khai được lưu riêng trong affiliate_site_settings, cho phép khách đọc nhưng chỉ server quản trị ghi. Khóa/token vẫn đặt tại Vercel Environment Variables; không có chức năng lưu khóa bí mật vào bảng công khai. Những ô văn bản của trang chính sách hỗ trợ tiêu đề bằng `## `, dòng văn bản và placeholder `{siteName}`, `{contactEmail}`; không hỗ trợ HTML/JS. Các đường dẫn được giữ ổn định để tránh hỏng liên kết đã nộp Meta.

Phạm vi trình chỉnh sửa: thông tin thương hiệu, nội dung giới thiệu và các trang công khai nêu trên. Nhãn thao tác, bố cục, màu sắc, chức năng và các quy tắc kỹ thuật vẫn nằm trong source, chưa phải trình kéo-thả sửa toàn bộ giao diện. Dữ liệu sản phẩm/ảnh tiếp tục chỉnh trong danh mục như trước.

Nếu chưa có bảng hoặc Supabase tạm không đọc được cấu hình, trang công khai dùng nội dung mặc định để không trắng trang; giao diện chỉnh sửa thông báo đang dùng mặc định. Tên/email mặc định nằm trong lib/site-defaults.json. Việc lưu cần quyền quản trị server hợp lệ.

### Điền khóa theo thứ tự dễ kiểm tra
- Bước A: hai biến Supabase/admin ở trên.
- Bước B: GEMINI_API_KEY (hoặc ANTHROPIC_API_KEY / OPENAI_API_KEY); redeploy rồi thử Tạo nội dung AI với một sản phẩm có mô tả.
- Bước C: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN và META_GRAPH_VERSION; token phải của Page, không phải App Secret.
- Bước D: THREADS_USER_ID và THREADS_ACCESS_TOKEN; ID/token phải của tài khoản Threads, không phải app.
- Mỗi lần đổi biến môi trường, redeploy. Chọn Production cho website chính; không cần đưa khóa production sang Preview nếu không dùng Preview để thử tích hợp.

Tài liệu: https://vercel.com/docs/environment-variables/managing-environment-variables
Lấy khóa AI: https://platform.openai.com/api-keys
Khởi đầu OpenAI: https://developers.openai.com/api/docs/quickstart
Token Page: https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage
Token Threads: https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions
