import type { NextConfig } from "next";
import path from "path";

// CORS is handled dynamically per-request in src/middleware.ts (needed
// because Access-Control-Allow-Origin doesn't accept comma-separated lists).
// This file only handles static site-wide security headers.

const nextConfig: NextConfig = {
  // Pin the workspace root — otherwise Next picks up /Users/apple/package-lock.json
  // and serves the wrong project.
  turbopack: { root: path.resolve(__dirname) },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
