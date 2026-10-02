import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Keranjang", robots: { index: false } };

/** Temporary page until the cart ships in Phase 3. */
export default function CartPlaceholderPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-4xl">Keranjang</h1>
      <p className="text-muted-foreground">Pemesanan online segera tersedia.</p>
      <Link href="/produk" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
        Lihat Produk
      </Link>
    </div>
  );
}
