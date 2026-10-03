import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the E2E suite build into its own folder while a dev server uses .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
