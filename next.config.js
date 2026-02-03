import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },

  async rewrites() {
    return [
      // Tape -> TradingBridgeApi (5197)
      {
        source: "/api/tape/:path*",
        destination: "http://localhost:5197/api/tape/:path*",
      },
      // (Optional) Everything else under /api stays on 5000
      {
        source: "/api/:path*",
        destination: "http://localhost:5000/api/:path*",
      },
    ];
  },

  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(process.cwd());
    return config;
  },
};

export default nextConfig;
