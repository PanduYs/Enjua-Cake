import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <h1 className="text-4xl">Halaman tidak ditemukan</h1>
      <p className="text-muted-foreground">Produk atau halaman yang kamu cari tidak tersedia.</p>
      <Link href="/produk" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
        Lihat Produk
      </Link>
    </main>
  );
}
