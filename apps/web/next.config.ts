import type { NextConfig } from 'next';

// API_INTERNAL_URL is resolved at runtime inside the Docker network (never in the browser).
// Defaults to the Docker Compose service name — only the URL string is recorded at build
// time; the actual TCP connection happens at request time when the API container is up.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_INTERNAL_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
