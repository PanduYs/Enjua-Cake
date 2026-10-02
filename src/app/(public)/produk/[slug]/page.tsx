import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PriceTag } from "@/components/public/price-tag";
import { ProductBadges } from "@/components/public/product-badges";
import { ProductGallery } from "@/components/public/product-gallery";
import { preorderLeadTimeText } from "@/lib/format/labels";
import { getProductBySlug } from "@/server/services/catalog";

import { loadSite } from "../../_lib/site";

type Params = Promise<{ slug: string }>;

const loadProduct = cache(async (slug: string) => {
  const { catalog } = await loadSite();
  return getProductBySlug(catalog, slug);
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await loadProduct((await params).slug);
  if (!product) return { title: "Produk tidak ditemukan" };
  const description = product.description.slice(0, 160) || `${product.name} — ${product.category.name}`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/produk/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      type: "website",
      images: product.mainImage ? [{ url: product.mainImage.url, alt: product.mainImage.alt }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { settings } = await loadSite();
  const product = await loadProduct((await params).slug);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <ol className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <li>
            <Link href="/produk" className="underline-offset-4 hover:underline">
              Produk
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/produk?kategori=${encodeURIComponent(product.category.slug)}`} className="underline-offset-4 hover:underline">
              {product.category.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="flex flex-col gap-4">
          <ProductBadges productType={product.productType} soldOut={product.soldOut} />
          <h1 className="text-4xl sm:text-5xl">{product.name}</h1>
          <PriceTag {...product.price} size="lg" />

          <dl className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Ketersediaan:</dt>
              <dd>{product.soldOut ? "Sold Out — saat ini tidak dapat dipesan" : "Tersedia"}</dd>
            </div>
            {product.productType === "PRE_ORDER" && product.minimumPreorderDays ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">Pre-Order:</dt>
                <dd>{preorderLeadTimeText(product.minimumPreorderDays)}</dd>
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">Ready Stock:</dt>
                <dd>Bisa diambil di hari yang sama bila dipesan sebelum pukul {settings.pickup_cutoff} WIB.</dd>
              </div>
            )}
            {product.maxQuantityPerOrder ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">Maksimal per pesanan:</dt>
                <dd>{product.maxQuantityPerOrder}</dd>
              </div>
            ) : null}
          </dl>

          {product.description ? (
            <div>
              <h2 className="mb-2 text-xl">Deskripsi</h2>
              <p className="whitespace-pre-line">{product.description}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
