import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * Development only: hostnames (no scheme/port) that may use the dev server's /_next resources
 * when the site is opened from another device on the LAN, e.g. a phone at
 * http://172.20.10.5:3000. Next.js rejects the HMR WebSocket from any other origin and, in
 * development, the page then never hydrates (menus and buttons do not respond). Extra hosts:
 * DEV_ALLOWED_ORIGINS="192.168.1.20,192.168.1.21" in .env.local.
 */
const devAllowedOrigins = [
  "172.20.10.5",
  ...(process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(process.env.NODE_ENV !== "production" ? { allowedDevOrigins: devAllowedOrigins } : {}),
  // Self-hosted container builds (TD-17 Opsi B) set NEXT_OUTPUT=standalone; managed hosting leaves it unset.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // Resolve <title>/meta before streaming the body for every client, so assistive
  // technology always finds the page title on load (metadata here is static and cheap).
  htmlLimitedBots: /.*/,
  // Native Argon2 binding must stay a Node.js external, not bundled.
  serverExternalPackages: ["@node-rs/argon2"],
  experimental: {
    // Admin uploads payment proofs (≤ 5 MB, FD-50) through a Server Action.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
