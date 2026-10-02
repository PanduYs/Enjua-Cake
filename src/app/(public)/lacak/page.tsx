import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Lacak Pesanan", robots: { index: false } };

/** Temporary page until order tracking ships in Phase 4. */
export default function TrackingPlaceholderPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-4xl">Lacak Pesanan</h1>
      <p className="text-muted-foreground">Fitur lacak pesanan segera tersedia.</p>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
        Kembali ke Beranda
      </Link>
    </div>
  );
}
