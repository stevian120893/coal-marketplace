import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/ejs-coal",

  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;