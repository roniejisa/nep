import type { Metadata } from 'next';
import './globals.css';
import './studio.css';
import './spacing.css';
import './admin-login.css';
import './reels.css';
import './product-import.css';
import './product-bulk.css';
import {getSiteSettings} from '@/lib/site-settings-server';
export async function generateMetadata():Promise<Metadata>{const {settings}=await getSiteSettings();return {title:settings.name+' — Quản trị Affiliate',description:settings.description,robots:{index:false,follow:false}};}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body>{children}</body></html>; }
