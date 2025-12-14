import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true, // щоб Next не ламав локальні іконки при build
  },
  webpack: (config) => {
    // "@/..." => корінь проєкту
    config.resolve.alias["@"] = path.resolve(process.cwd());
    return config;
  },
};

export default nextConfig;
