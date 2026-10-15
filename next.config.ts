import type { NextConfig } from 'next';
const nextConfig: NextConfig = { images: { unoptimized: true }, trailingSlash: true, experimental: { cpus: 2 } };
export default nextConfig;
