import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { getEnv } from "@/server/env";

import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    // Validated APP_URL (required; https on the live site) — never a localhost fallback.
    metadataBase: new URL(getEnv().APP_URL),
    title: { default: "Enjua Cake's", template: "%s · Enjua Cake's" },
    description: "Pesan kue Enjua Cake's untuk diambil di toko.",
    openGraph: { siteName: "Enjua Cake's", locale: "id_ID", type: "website" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F8EDE1",
};

/** Rendered per request so the CSP nonce (src/proxy.ts) can be applied to every page. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
