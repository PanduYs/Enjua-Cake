/**
 * Public-site copy. PLACEHOLDER marketing text until the client approves final
 * copy (GL-12). Business facts (cutoff, hours, address…) come from Website Settings.
 */
export const heroCopy = {
  headline: "Kue Buatan Tangan untuk Momen Manismu",
  /** Same headline, broken for the hero's two-line editorial setting. */
  headlineLines: ["Kue Buatan Tangan", "untuk Momen Manismu"] as const,
  supporting: "Pilih kue favoritmu, tentukan tanggal pengambilan, dan ambil di toko.",
  primaryCta: "Pesan Sekarang",
  secondaryCta: "Lihat Produk",
};

export const navItems = [
  { href: "/", label: "Beranda" },
  { href: "/produk", label: "Produk" },
  { href: "/#cara-pesan", label: "Cara Pesan" },
  { href: "/lacak", label: "Lacak Pesanan" },
  { href: "/#kontak", label: "Kontak" },
] as const;
