import Link from "next/link";

import { CategoryCards } from "@/components/public/category-cards";
import { ChatIcon, ClockIcon, PinIcon } from "@/components/public/icons";
import { HomeHero } from "@/components/public/home-hero";
import { ProductGrid } from "@/components/public/product-card";
import { SectionHeading } from "@/components/public/section-heading";
import { availableHeroAssets } from "@/server/hero-assets";
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

  return (
    <>
      <HomeHero images={availableHeroAssets()} />

      {featured.length > 0 ? (
        <section aria-labelledby="produk-unggulan" className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:pt-12 sm:pb-14">
          <SectionHeading
            id="produk-unggulan"
            title="Produk Unggulan"
            subtitle="Pilihan favorit dari dapur kami."
            action={
              <Link href="/produk" className="hidden shrink-0 pb-0.5 text-sm font-semibold text-primary underline underline-offset-4 sm:inline">
                Lihat semua produk
              </Link>
            }
          />
          <ProductGrid products={featured} />
          <div className="mt-6 text-center sm:hidden">
            <Link href="/produk" className="inline-flex min-h-11 items-center rounded-full border-2 border-primary px-6 font-semibold text-primary">
              Lihat semua produk
            </Link>
          </div>
        </section>
      ) : null}

      {categoryCards.length > 0 ? (
        <section aria-labelledby="kategori" className="scroll-mt-20 bg-surface-muted/70">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
            <SectionHeading id="kategori" title="Kategori" subtitle="Temukan kue sesuai kebutuhanmu." />
            <CategoryCards categories={categoryCards} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="cara-pesan" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:py-14">
        <SectionHeading id="cara-pesan" title="Cara Pesan" subtitle="Semua pesanan diambil langsung di toko (pickup)." />
        {/* Phones: a swipeable journey; tablets/desktops: one row joined by a line. */}
        {/* tabIndex: on phones the rail scrolls but holds no links, so keyboard users need to focus it to scroll. */}
        <ol
          tabIndex={0}
          aria-label="Langkah pemesanan"
          className="enjua-rail -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0 md:pb-0 focus-visible:outline-offset-[-3px]"
        >
          {ORDER_STEPS.map((step, index) => (
            <li key={step.title} className="relative w-[70%] max-w-[16rem] shrink-0 snap-start md:w-auto md:max-w-none">
              {index < ORDER_STEPS.length - 1 ? (
                <span aria-hidden="true" className="absolute top-[1.375rem] left-[calc(50%+1.75rem)] hidden h-px w-[calc(100%-2.5rem)] bg-accent-soft md:block" />
              ) : null}
              <div className="flex h-full flex-col gap-1.5 rounded-card bg-surface p-4 md:items-center md:bg-transparent md:p-0 md:text-center">
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary font-heading text-lg text-primary-foreground" aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className="mt-1 text-lg">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="rounded-card bg-badge-ready p-4 sm:p-5">
            <h3 className="text-lg sm:text-xl">Ready Stock</h3>
            <p className="mt-1 text-sm">
              Bisa diambil di hari yang sama bila dipesan sebelum pukul {settings.pickup_cutoff} WIB dan kuota tanggal tersebut masih tersedia.
            </p>
          </div>
          <div className="rounded-card bg-badge-preorder p-4 sm:p-5">
            <h3 className="text-lg sm:text-xl">Pre-Order</h3>
            <p className="mt-1 text-sm">
              Dibuat khusus untukmu. Setiap produk punya waktu minimum produksi, jadi pilih tanggal pickup yang memenuhi waktu tersebut.
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Setiap tanggal pickup memiliki kuota pesanan terbatas.</p>
      </section>

      <section aria-labelledby="kontak" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-2 pb-10 sm:pb-14">
        <SectionHeading id="kontak" title="Kontak" />
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {settings.address ? (
            <div className="flex gap-3 rounded-card bg-surface p-4 sm:p-5">
              <PinIcon className="shrink-0 text-primary" />
              <div>
                <h3 className="text-lg">Alamat pickup</h3>
                <p className="text-sm">{settings.address}</p>
                {settings.pickup_instructions ? <p className="mt-2 text-sm text-muted-foreground">{settings.pickup_instructions}</p> : null}
              </div>
            </div>
          ) : null}
          {settings.pickup_hours || settings.operating_hours ? (
            <div className="flex gap-3 rounded-card bg-surface p-4 sm:p-5">
              <ClockIcon className="shrink-0 text-primary" />
              <div>
                <h3 className="text-lg">Jam</h3>
                {settings.pickup_hours ? <p className="text-sm">Pickup: {settings.pickup_hours}</p> : null}
                {settings.operating_hours ? <p className="text-sm">Operasional: {settings.operating_hours}</p> : null}
              </div>
            </div>
          ) : null}
          {whatsAppHref ? (
            <div className="flex gap-3 rounded-card bg-surface p-4 sm:p-5">
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
