import { createClient } from '@supabase/supabase-js';

// Publishable configuration is intentionally public. Access is enforced by RLS.
export const SUPABASE_URL = 'https://aegbygaxnynjfkmogpbg.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4EnHkrEczA-ljw2n-5nAVQ_xPPQ3f3n';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
export const BUCKET = 'affiliate-product-images';
export const categories = ['Sữa tắm', 'Kem đánh răng', 'Sữa rửa mặt', 'Nước giặt', 'Khẩu trang', 'Khác'];
export type ProductImage = { id: string; product_id: string; owner_id: string; storage_path: string; original_name: string; size_bytes: number; original_bytes: number; width: number; height: number; sort_order: number; created_at: string; url?: string };
export type Product = { source_platform?:string|null; external_product_id?:string|null; external_shop_id?:string|null; import_metadata?:Record<string,unknown>; id: string; owner_id: string; name: string; category: string; description: string; affiliate_url: string; source_url: string; shop_name: string; variant: string; price: number | null; commission_rate: number | null; status: 'draft' | 'ready' | 'archived'; notes: string; created_at: string; updated_at: string; verified_at: string | null; product_images: ProductImage[] };

export { readableError, operationError } from './errors';

export function safeHttpUrl(value: string): string | null {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export const formatBytes = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
