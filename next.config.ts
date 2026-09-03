import type { NextConfig } from "next";

// Origins allowed to call /api from a browser. The Flutter web app is served
// from its own domain, so every request it makes here is cross-origin and needs
// CORS; native builds are unaffected. Comma-separated, overridable per env.
const APP_WEB_ORIGINS = (
  process.env.APP_WEB_ORIGINS ?? 'https://new-church-project.vercel.app'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Do not fail the production build on ESLint errors
    ignoreDuringBuilds: true,
  },
  async headers() {
    // Without these a browser never sends the request at all: the preflight
    // fails and the app sees a network error, not a response.
    return APP_WEB_ORIGINS.map((origin) => ({
      source: '/api/:path*',
      // Only emit the allow-origin for a request that actually came from it,
      // so multiple origins each get their own exact-match header.
      has: [{ type: 'header' as const, key: 'origin', value: origin }],
      headers: [
        { key: 'Access-Control-Allow-Origin', value: origin },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
        {
          key: 'Access-Control-Allow-Headers',
          value: 'Content-Type, Authorization, x-otp-app-secret',
        },
        { key: 'Access-Control-Max-Age', value: '86400' },
        // Responses differ by Origin, so caches must not share them.
        { key: 'Vary', value: 'Origin' },
      ],
    }));
  },

  async redirects() {
    return [
      {
        source: "/dashboard/today-verse",
        destination: "/dashboard/daily-verse",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
