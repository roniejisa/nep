import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Nếp — Quản trị Affiliate', description: 'Một nơi gọn gàng cho sản phẩm, hình ảnh và nội dung affiliate của bạn.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body>{children}</body></html>; }
