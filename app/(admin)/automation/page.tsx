import Link from 'next/link';
import AutomationPanel from '@/components/automation-panel';
export const metadata={title:'Tự động đăng bài | Nếp'};
export default function Page(){return <div className="automation-page"><Link className="text-btn" href="/san-pham/">← Về quản trị</Link><AutomationPanel/></div>;}
