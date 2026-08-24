import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Always defined so `"true"` checks are constant-folded at build time:
  // demo credentials are dead-code-eliminated from production bundles.
  env: {
    NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? "false",
  },
};

export default nextConfig;
