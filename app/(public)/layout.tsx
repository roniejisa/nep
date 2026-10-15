import {getSiteSettings} from '@/lib/site-settings-server';
import Link from 'next/link';
import type { Metadata } from 'next';
import './public.css';
export const metadata: Metadata = { robots: { index: true, follow: true } };
export default async function PublicLayout({children}:{children:React.ReactNode}) {
 const {settings}=await getSiteSettings();
 return <div className="public-site"><header className="public-header"><Link href="/" className="public-brand">{settings.name}<span>.</span></Link><span>Affiliate Studio</span><Link href="/" className="public-back">Về ứng dụng →</Link></header><main className="public-document">{children}</main><footer className="public-footer"><strong>{settings.name} · Thông tin ứng dụng</strong><nav aria-label="Thông tin chính sách"><Link href="/privacy-policy/">Quyền riêng tư</Link><Link href="/terms-of-service/">Điều khoản dịch vụ</Link><Link href="/data-deletion/">Xóa dữ liệu</Link><Link href="/contact/">Liên hệ</Link></nav><p>Các trang thông tin này có thể xem mà không cần đăng nhập.</p></footer></div>;
}
