import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
