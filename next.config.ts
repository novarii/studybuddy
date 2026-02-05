import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["shiki"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
