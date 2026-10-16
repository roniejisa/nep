# Cập nhật source Nếp lên Vercel

Source đầy đủ nằm trong thư mục `nep/` của file ZIP.

## Quan trọng khi cập nhật repository cũ

Chép đè file từ ZIP không tự xóa file cũ. Trước khi commit, xóa đúng hai file sau nếu chúng còn trong repository:

```text
app/automation/page.tsx
app/categories/page.tsx
```

Giữ nguyên hai file mới:

```text
app/(admin)/automation/page.tsx
app/(admin)/categories/page.tsx
```

Không xóa `app/api/automation`. Không xóa các biến môi trường đã cài trên Vercel.

1. Giải nén ZIP.
2. Chép nội dung bên trong `nep/` vào thư mục gốc repository hiện tại, nơi có `package.json`. Không tạo thêm thư mục `nep/` lồng bên trong repository.
3. Xóa hai file cũ nêu trên; kiểm tra phần thay đổi Git có ghi nhận hai file bị xóa.
4. Commit và push. Vercel sẽ build lại với cấu hình và biến môi trường hiện có.

Thư mục `(admin)` chỉ dùng gom layout chung, không xuất hiện trên URL. Vì vậy hai bản cũ/mới không được tồn tại đồng thời.

Bản cập nhật routing và spacing này không cần chạy SQL mới. Bản source trước đã build thành công; lỗi trong ảnh là do file route cũ còn sót trong repository triển khai.
