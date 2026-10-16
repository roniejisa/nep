import Link from 'next/link';
import CategoryManager from '@/components/category-manager';
export const metadata={title:'Danh mục sản phẩm | Nếp'};
export default function Page(){return <div className="automation-page"><Link className="text-btn" href="/san-pham/">← Về quản trị</Link><CategoryManager/></div>;}
