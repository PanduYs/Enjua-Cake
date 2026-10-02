import Image from "next/image";
import Link from "next/link";

import { BrushEdge } from "@/components/public/brush-edge";
import { CategoryCards } from "@/components/public/category-cards";
import { CakeIcon, ChatIcon, ClockIcon, PinIcon } from "@/components/public/icons";
import { ProductGrid } from "@/components/public/product-card";
import { SectionHeading } from "@/components/public/section-heading";
import { heroCopy } from "@/lib/copy/public";
import { categoryFallbackImages, listActiveCategories, listProducts } from "@/server/services/catalog";

import { loadSite } from "./_lib/site";

const ORDER_STEPS = [
  { title: "Pilih kue", text: "Lihat katalog dan pilih produk Ready Stock maupun Pre-Order." },
  { title: "Checkout", text: "Isi nama dan nomor WhatsApp, lalu pilih tanggal pickup yang tersedia." },
  { title: "Bayar", text: "QRIS atau transfer bank (DP 50% atau penuh), atau cash saat pickup untuk pesanan Ready Stock." },
  { title: "Lacak pesanan", text: "Simpan nomor pesanan dan kode akses untuk memantau status pesananmu." },
  { title: "Ambil di toko", text: "Datang pada tanggal pickup yang kamu pilih." },
] as const;

export default async function HomePage() {
  const { settings, whatsAppHref, catalog } = await loadSite();
  const [featured, categories] = await Promise.all([listProducts(catalog, { featuredOnly: true, limit: 8 }), listActiveCategories(catalog)]);
  const fallbackImages = await categoryFallbackImages(
    catalog,
    categories.filter((c) => !c.image).map((c) => c.id),
  );
  const categoryCards = categories.map((c) => ({ ...c, image: c.image ?? fallbackImages.get(c.id) ?? null }));
  const heroImage = featured.find((p) => p.mainImage)?.mainImage ?? null;

  return (
    <>
      {/* Hero — split layout on mauve with an organic edge (PRD-Design §9). */}
      <section aria-labelledby="hero-title" className="text-accent">
        <div className="bg-accent text-accent-foreground">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:py-16 lg:grid-cols-2 lg:py-20">
            <div className="flex flex-col gap-5">
              <h1 id="hero-title" className="text-4xl leading-tight sm:text-5xl lg:text-6xl">
                {heroCopy.headline}
              </h1>
              <p className="max-w-xl text-lg">{heroCopy.supporting}</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/produk"
                  className="inline-flex min-h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:opacity-90"
                >
                  {heroCopy.primaryCta}
                </Link>
                <Link
                  href="/produk"
                  className="inline-flex min-h-12 items-center rounded-full border-2 border-accent-foreground px-6 font-semibold text-accent-foreground hover:bg-accent-foreground/10"
                >
                  {heroCopy.secondaryCta}
                </Link>
              </div>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-md">
              {heroImage ? (
                <Image
                  src={heroImage.url}
                  alt={heroImage.alt}
                  fill
                  priority
                  sizes="(min-width: 1024px) 40vw, 90vw"
                  className="rounded-full object-cover shadow-xl"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-full bg-accent-soft/40" aria-hidden="true">
                  <CakeIcon width={120} height={120} />
                </div>
              )}
            </div>
          </div>
        </div>
        <BrushEdge position="bottom" />
      </section>

      {featured.length > 0 ? (
        <section aria-labelledby="produk-unggulan" className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <SectionHeading id="produk-unggulan" title="Produk Unggulan" subtitle="Pilihan favorit dari dapur kami." />
          <ProductGrid products={featured} />
          <div className="mt-8 text-center">
            <Link href="/produk" className="inline-flex min-h-11 items-center rounded-full border-2 border-primary px-6 font-semibold text-primary">
              Lihat semua produk
            </Link>
          </div>
        </section>
      ) : null}

      {categoryCards.length > 0 ? (
        <section aria-labelledby="kategori" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:py-16">
          <SectionHeading id="kategori" title="Kategori" subtitle="Temukan kue sesuai kebutuhanmu." />
          <CategoryCards categories={categoryCards} />
        </section>
      ) : null}

      <section aria-labelledby="tentang-kami" className="scroll-mt-20 bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <SectionHeading id="tentang-kami" title="Tentang Kami" />
          <p className="max-w-3xl text-lg">
            {settings.business_description ?? `Cerita tentang ${settings.business_name} akan segera hadir.`}
          </p>
        </div>
      </section>

      <section aria-labelledby="cara-pesan" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:py-16">
        <SectionHeading id="cara-pesan" title="Cara Pesan" subtitle="Semua pesanan diambil langsung di toko (pickup)." />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ORDER_STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2 rounded-card bg-surface p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="text-lg">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-card bg-badge-ready p-5">
            <h3 className="text-xl">Ready Stock</h3>
            <p className="mt-2 text-sm">
              Bisa diambil di hari yang sama bila dipesan sebelum pukul {settings.pickup_cutoff} WIB dan kuota tanggal tersebut masih tersedia.
            </p>
          </div>
          <div className="rounded-card bg-badge-preorder p-5">
            <h3 className="text-xl">Pre-Order</h3>
            <p className="mt-2 text-sm">
              Dibuat khusus untukmu. Setiap produk punya waktu minimum produksi, jadi pilih tanggal pickup yang memenuhi waktu tersebut.
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Setiap tanggal pickup memiliki kuota pesanan terbatas.</p>
      </section>

      <section aria-labelledby="kontak" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:py-16">
        <SectionHeading id="kontak" title="Kontak" />
        <div className="grid gap-4 md:grid-cols-3">
          {settings.address ? (
            <div className="flex gap-3 rounded-card bg-surface p-5">
              <PinIcon className="shrink-0 text-primary" />
              <div>
                <h3 className="text-lg">Alamat pickup</h3>
                <p className="text-sm">{settings.address}</p>
                {settings.pickup_instructions ? <p className="mt-2 text-sm text-muted-foreground">{settings.pickup_instructions}</p> : null}
              </div>
            </div>
          ) : null}
          {settings.pickup_hours || settings.operating_hours ? (
            <div className="flex gap-3 rounded-card bg-surface p-5">
              <ClockIcon className="shrink-0 text-primary" />
              <div>
                <h3 className="text-lg">Jam</h3>
                {settings.pickup_hours ? <p className="text-sm">Pickup: {settings.pickup_hours}</p> : null}
                {settings.operating_hours ? <p className="text-sm">Operasional: {settings.operating_hours}</p> : null}
              </div>
            </div>
          ) : null}
          {whatsAppHref ? (
            <div className="flex gap-3 rounded-card bg-surface p-5">
              <ChatIcon className="shrink-0 text-primary" />
              <div>
                <h3 className="text-lg">WhatsApp</h3>
                <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline underline-offset-4">
                  Chat dengan kami
                </a>
              </div>
            </div>
          ) : null}
        </div>
        {!settings.address && !settings.pickup_hours && !settings.operating_hours && !whatsAppHref ? (
          <p className="text-muted-foreground">Informasi kontak akan segera tersedia.</p>
        ) : null}
      </section>
    </>
  );
}
