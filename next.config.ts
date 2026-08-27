import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root — otherwise Next picks up /Users/apple/package-lock.json
  // and serves the wrong project.
  turbopack: { root: path.resolve(__dirname) },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Accept, Content-Type, Authorization, x-session-id" },
        ]
      }
    ]
  }
};

export default nextConfig;
