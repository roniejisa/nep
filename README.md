# Nếp — Quản trị Shopee Affiliate

**Bản 1.1 cho Vercel: đọc DEPLOY-VERCEL.md để bật Nội dung AI và đăng Meta.**

Ứng dụng Next.js App Router + Supabase, giao diện tiếng Việt, responsive. Dùng Next.js server trên Vercel; dữ liệu được đọc/ghi trực tiếp qua Supabase SDK và được bảo vệ bằng Auth + RLS.

## Thiết lập Supabase một lần

Dự án đã cấu hình URL và publishable key do chủ dự án cung cấp. Đây là cấu hình công khai dành cho trình duyệt, không phải service-role key.

1. Trong Supabase SQL Editor, chạy toàn bộ `supabase/schema.sql`.
2. Vào Authentication → Users → Add user → Create new user. Tạo tài khoản email/mật khẩu cho quản trị viên; xác nhận email trong dashboard nếu phù hợp.
3. Mở web và đăng nhập bằng tài khoản vừa tạo. Tài khoản này khác tài khoản đăng nhập dashboard Supabase.
4. Thêm một sản phẩm và ảnh. Kiểm tra dữ liệu trong `affiliate_products`, `affiliate_product_images`, và Storage → `affiliate-product-images`.

Không cần service-role key trong ứng dụng. Không tắt RLS và không chuyển bucket thành public.

## Chức năng

- Thêm, sửa, xóa sản phẩm; mô tả gốc, link affiliate nguyên bản, nguồn thông tin, quy cách, shop, giá tham khảo, hoa hồng, trạng thái và ngày xác minh.
- Tìm kiếm, lọc nhóm/trạng thái, sắp xếp, chế độ thẻ hoặc bảng.
- Nhập 5 link đã cung cấp thành các bản nháp chưa xác minh; không gán tên sản phẩm phỏng đoán.
- Kéo thả hoặc chọn JPG/PNG/WebP, chuyển đổi cục bộ sang WebP. Không tải ảnh gốc lên Storage.
- Ba chế độ: Gọn nhẹ 1200px/80%, Cân bằng 1600px/84%, Nét hơn 2200px/90%. Cạnh dài không vượt cấu hình; không phóng lớn ảnh gốc. Chất lượng tự điều chỉnh đến tối thiểu 72% nếu ảnh vượt mục tiêu dung lượng. Mục tiêu dung lượng không phải cam kết chất lượng cảm quan hay kích thước tuyệt đối.
- Tối đa 12 ảnh/sản phẩm trên giao diện, 20MB/ảnh nguồn, 60 megapixel/ảnh nguồn, 2MB/ảnh đầu ra. Bucket chỉ cho MIME image/webp. Client kiểm tra cả MIME và chữ ký RIFF/WEBP.
- Chọn ảnh đại diện, xem ảnh lớn, thống kê dung lượng, xóa cả file và bản ghi.
- Ảnh riêng tư được đọc bằng signed URL hạn một giờ; danh mục làm mới mỗi 45 phút khi trang mở.
- Xuất JSON dữ liệu đang tải; không nhúng signed URL có thời hạn hoặc file ảnh vào JSON.

## Ranh giới dữ liệu

- Các bảng dùng tiền tố `affiliate_`; script không xóa bảng hiện có của dự án.
- Mỗi tài khoản chỉ đọc/ghi sản phẩm và ảnh thuộc tài khoản đó.
- Khóa ngoại kép buộc ảnh liên kết đúng sản phẩm và cùng chủ sở hữu.
- Đường dẫn ảnh: `<user_id>/<product_id>/<uuid>.webp`.
- Sản phẩm được lưu trước ảnh. Nếu ảnh lỗi, giao diện báo lỗi và giữ phần chưa lưu để thử lại. File upload có bản ghi ảnh thất bại sẽ được thử dọn ngay.
- Đổi ảnh đại diện/xóa ảnh đã lưu có tác dụng ngay; nút Đóng không hoàn tác các thao tác này.
- Chỉ tải 500 sản phẩm cập nhật gần nhất ở bản đầu; giao diện thông báo nếu tổng số vượt giới hạn. Thống kê ảnh/xuất dữ liệu phản ánh danh sách đang tải.
- Có tạo nội dung AI và gửi bài Facebook Page / Threads sau khi duyệt, khi đã cấu hình server theo DEPLOY-VERCEL.md. Chưa tự lấy dữ liệu Shopee hoặc đăng không cần duyệt.

## Phát triển

Yêu cầu Node.js phù hợp với Next.js 16.

```sh
npm ci
npm run dev
npm run typecheck
npm run build
```

Build server xuất vào `.next/`, không dùng thư mục `out/`. `scripts/build.mjs` chỉ bỏ qua bộ đo RSS tùy chọn của Next.js khi môi trường không cung cấp syscall `uv_resident_set_memory`; kiểm tra kiểu, biên dịch và xuất trang vẫn chạy đầy đủ. Không có thay đổi này ở môi trường hỗ trợ thống kê bộ nhớ.

## Sửa lỗi upload RLS — phiên bản 1.0.2

Nếu đã chạy script thiết lập cũ, chạy `supabase/fix-storage-policy.sql` một lần. Script chỉ sửa biểu thức WITH CHECK của policy upload, giữ nguyên dữ liệu và phân quyền theo chủ sở hữu.

Nguyên nhân: `storage.foldername(name)` trong subquery `affiliate_products p` phân giải `name` thành `p.name` thay vì tên object Storage. Bản sửa dùng `storage.objects.name` rõ ràng. Test PostgreSQL qua PGlite tái hiện lỗi cũ, kiểm tra upload đúng chủ được phép và chặn khác chủ/sai sản phẩm/sai đuôi file.

Thông báo lỗi mới giữ bước thực hiện, mã lỗi và thông báo gốc. Phiên đăng nhập được xác minh trước khi lưu, và thao tác cập nhật không ghi lại ID/chủ sở hữu sản phẩm.

```sh
node --test tests/errors.test.mjs tests/storage-policy.test.mjs
```
