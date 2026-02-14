import path from "path";

const AXI = (process.env.AXI_BASE_URL || "http://localhost:5197").replace(/\/+$/, "");
const TD = (process.env.TICKERDAYS_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },

  async rewrites() {
    return [
      // =========================
      // Tickerdays
      // =========================
      {
        source: "/api/tickerdays/:path*",
        destination: `${TD}/api/tickerdays/:path*`,
      },

      // =========================
      // TradingBridgeApi / TRAP
      // =========================
      {
        source: "/api/tape/:path*",
        destination: `${AXI}/api/tape/:path*`,
      },
      {
        source: "/api/live/:path*",
        destination: `${AXI}/api/live/:path*`,
      },
      {
        source: "/api/sifter/:path*",
        destination: `${AXI}/api/sifter/:path*`,
      },

      // Backward-compat aliases (old front paths)
      {
        source: "/api/full-quotes",
        destination: `${AXI}/api/live/full-quotes`,
      },

      // Fallback: everything else under /api -> AXI
      {
        source: "/api/:path*",
        destination: `${AXI}/api/:path*`,
      },
    ];
  },

  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(process.cwd());
    return config;
  },
};

export default nextConfig;