import type { Metadata } from "next";
import Link from "next/link";

import { ProductGrid } from "@/components/public/product-card";
import { listActiveCategories, listProducts } from "@/server/services/catalog";

import { loadSite } from "../_lib/site";

export const metadata: Metadata = {
  title: "Produk",
  description: "Katalog kue Ready Stock dan Pre-Order untuk diambil di toko.",
  alternates: { canonical: "/produk" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const { catalog } = await loadSite();
  const raw = (await searchParams).kategori;
  const requestedSlug = typeof raw === "string" && raw.length <= 100 ? raw : undefined;

  const categories = await listActiveCategories(catalog);
  const activeCategory = requestedSlug ? categories.find((c) => c.slug === requestedSlug) : undefined;
  const products = activeCategory ? await listProducts(catalog, { categorySlug: activeCategory.slug }) : requestedSlug ? [] : await listProducts(catalog);

  const chips = [{ slug: null, name: "Semua" }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <h1 className="text-4xl sm:text-5xl">{activeCategory ? activeCategory.name : "Produk"}</h1>
      {activeCategory?.description ? <p className="mt-2 max-w-2xl text-muted-foreground">{activeCategory.description}</p> : null}

      {categories.length > 0 ? (
        <nav aria-label="Filter kategori" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const isActive = chip.slug === (activeCategory?.slug ?? null) && !(requestedSlug && !activeCategory);
              return (
                <li key={chip.slug ?? "semua"}>
                  <Link
                    href={chip.slug ? `/produk?kategori=${encodeURIComponent(chip.slug)}` : "/produk"}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${
                      isActive ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground bg-surface text-foreground hover:bg-surface-muted"
                    }`}
                  >
                    {chip.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <div className="mt-8">
        {products.length > 0 ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
              {products.length} produk
            </p>
            <ProductGrid products={products} headingLevel={2} />
          </>
        ) : (
          <div className="rounded-card bg-surface p-8 text-center">
            <p className="text-lg">{requestedSlug && !activeCategory ? "Kategori tidak ditemukan." : "Belum ada produk di sini."}</p>
            <Link href="/produk" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
              Lihat semua produk
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
