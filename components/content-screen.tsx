'use client';

import Link from 'next/link';
import {useAdmin} from '@/components/admin-context';

import ContentStudio from '@/components/content-studio';

export default function ContentScreen(){const {user,products,loadProducts,view}=useAdmin();return <>        {view==='content' && user && <><div className="button-row" style={{marginBottom:"var(--space-16)"}}><Link className="btn primary" href="/automation/">Lịch đăng tự động →</Link></div><ContentStudio key={user.id} products={products} onProductsChanged={loadProducts}/></>}
</>;}
