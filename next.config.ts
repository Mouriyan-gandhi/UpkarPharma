import type { NextConfig } from "next";
import path from "path";

// Comma-separated list of origins the browser is allowed to hit /api/* from.
// If unset, we allow only same-origin (empty allowlist).
// Example: ALLOWED_WEB_ORIGINS="https://upkarpharma.vercel.app,http://localhost:3000"
const rawAllowed = process.env.ALLOWED_WEB_ORIGINS || "";
const allowedOrigins = rawAllowed
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Local-dev fallback so the Expo web target + our own localhost dev server work
// without the operator having to set the env var during development.
if (process.env.NODE_ENV !== "production") {
  for (const o of [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8081",
    "http://localhost:19006",
  ]) {
    if (!allowedOrigins.includes(o)) allowedOrigins.push(o);
  }
}

// A comma-joined string is fine for the header value — the browser matches the
// incoming Origin against the list. If we ever need per-origin credentials we
// can move to a middleware that echoes back the specific origin.
const corsAllowedOrigin = allowedOrigins.join(", ") || "https://null.invalid";

const nextConfig: NextConfig = {
  // Pin the workspace root — otherwise Next picks up /Users/apple/package-lock.json
  // and serves the wrong project.
  turbopack: { root: path.resolve(__dirname) },

  async headers() {
    return [
      // Site-wide security headers — apply to every response.
      {
        source: "/:path*",
        headers: [
          // HTTPS-only for a year, include subdomains, allow browser preload.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          // Deny framing entirely — no clickjacking of admin panel.
          { key: "X-Frame-Options", value: "DENY" },
          // Trust declared MIME types; prevent XSS via MIME sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Only send Referer to same origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable browser features we don't use.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
      // API routes: allow CORS from the allowlist + expected headers.
      // Mobile fetches from React Native send `Origin: null` or omit it entirely,
      // and the browser doesn't enforce CORS on native fetches — so mobile keeps
      // working regardless of what we put here.
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: corsAllowedOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Accept, Content-Type, Authorization, x-session-id" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
