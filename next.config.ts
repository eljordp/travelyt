import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin to this file's directory: stray package.json/lockfiles in parent
    // directories (e.g. the user home dir) otherwise derail workspace-root
    // inference and break the build.
    root: path.dirname(new URL(import.meta.url).pathname),
  },
};

export default nextConfig;
