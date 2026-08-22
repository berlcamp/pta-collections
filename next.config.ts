import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // D20: this app is fully dynamic. No cacheComponents, no PPR, no ISR.
  // Every route is authenticated and tenant-scoped; a cached fragment leaking
  // School A's data into a School B request is the exact breach RLS exists to prevent.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lvcbmopdstvupjpytjbb.supabase.co" },
      // Local Supabase storage (school logos) during development.
      { protocol: "http", hostname: "127.0.0.1", port: "54721" },
      { protocol: "http", hostname: "localhost", port: "54721" },
    ],
  },
};

export default nextConfig;
