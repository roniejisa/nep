# Đưa Nếp lên Vercel

## 1. Đưa mã nguồn lên GitHub
Giải nén ZIP. Đưa toàn bộ nội dung thư mục `nep-affiliate` vào một repository GitHub của bạn (nên đặt private). Bao gồm cả package-lock.json và các file cấu hình. Không đưa node_modules hoặc out lên GitHub.

## 2. Import vào Vercel
- Tạo Project và import repository vừa tạo.
- Framework Preset: Next.js.
- Root Directory: thư mục chứa package.json (nếu upload cả thư mục nep-affiliate thì chọn thư mục đó).
- Install Command: npm ci.
- Build Command: npm run build.
- Giữ Output Directory theo mặc định của Next.js; dự án cấu hình static export vào out/.
- Chọn Node.js 22.x nếu cần chọn phiên bản runtime.
- Deploy rồi mở URL Vercel cấp và đăng nhập bằng tài khoản Supabase Auth đang dùng.

## 3. Supabase
Bản source này đã có URL và publishable key công khai của dự án Supabase bạn cung cấp trong lib/supabase.ts. Vì vậy không cần thêm biến môi trường để chạy bản hiện tại. Publishable key được phép nằm ở frontend; quyền dữ liệu do Auth và RLS kiểm soát.

Dữ liệu và ảnh vẫn nằm trên Supabase. Nếu hệ thống đã lưu sản phẩm và upload được ảnh, không cần chạy SQL lại. Bạn sẽ cần đăng nhập lại trên tên miền Vercel.

Nếu thiết lập một Supabase mới: sửa hai hằng số trong lib/supabase.ts, chạy supabase/schema.sql trong SQL Editor và tạo tài khoản quản trị ở Authentication > Users. Nếu chỉ sửa lỗi upload từ bản SQL cũ, dùng supabase/fix-storage-policy.sql.

Không có S3 secret hay service-role key trong bản source. Ảnh dùng Supabase Storage SDK, không dùng S3 credentials.

## Chạy trên máy
```sh
npm ci
npm run dev
```

Kiểm tra:
```sh
npm run typecheck
node --test tests/errors.test.mjs tests/storage-policy.test.mjs
npm run build
```

Build script chạy Next.js webpack; phần tương thích môi trường chỉ hoạt động khi hệ điều hành không cung cấp chỉ số RSS. Trên Vercel thông thường, script chạy build bình thường.

## Phạm vi bàn giao
Đã có: đăng nhập, quản lý sản phẩm/link affiliate, nén và lưu WebP, tìm kiếm/lọc và xuất JSON, SQL và bản sửa policy upload.
Chưa có: AI viết bài, lịch đăng bài, kết nối Facebook/Threads hoặc tự đăng nội dung.
ZIP là source code, không phải bản sao dữ liệu/ảnh trong Supabase. Việc triển khai Vercel do bạn thực hiện; chưa kiểm thử bản triển khai trong tài khoản Vercel của bạn.
