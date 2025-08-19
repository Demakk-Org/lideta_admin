import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Do not fail the production build on ESLint errors
    ignoreDuringBuilds: true,
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
