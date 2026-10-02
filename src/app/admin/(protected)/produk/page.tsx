import type { Metadata } from "next";
import Link from "next/link";

import { PRODUCT_TYPE_LABEL, SOLD_OUT_LABEL } from "@/lib/format/labels";
import { formatRupiah } from "@/lib/format/rupiah";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAdminProducts } from "@/server/services/admin-catalog";
import { getStorage } from "@/server/storage";

export const metadata: Metadata = { title: "Produk" };

function Price({ price, salePrice }: { price: number; salePrice: number | null }) {
  return salePrice !== null ? (
    <span>
      {formatRupiah(salePrice)} <s className="text-muted-foreground">{formatRupiah(price)}</s>
    </span>
  ) : (
    <span>{formatRupiah(price)}</span>
  );
}

function Flags({ p }: { p: { isActive: boolean; isFeatured: boolean; availability: string; productType: "READY_STOCK" | "PRE_ORDER" } }) {
  return (
    <span className="flex flex-wrap gap-1 text-xs">
      <span className="rounded-full bg-surface-muted px-2 py-0.5">{PRODUCT_TYPE_LABEL[p.productType]}</span>
      {p.availability === "SOLD_OUT" ? <span className="rounded-full bg-badge-soldout px-2 py-0.5 text-badge-soldout-foreground">{SOLD_OUT_LABEL}</span> : null}
      {p.isFeatured ? <span className="rounded-full bg-pastel-peach px-2 py-0.5">Featured</span> : null}
      {!p.isActive ? <span className="rounded-full border border-danger px-2 py-0.5 text-danger">Nonaktif</span> : null}
    </span>
  );
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const rows = await listAdminProducts({ db: getDb(), publicBucket: getStorage().public });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Produk</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/kategori" className="inline-flex min-h-11 items-center rounded-control border border-primary px-4 font-semibold text-primary">
            Kelola Kategori
          </Link>
          <Link href="/admin/produk/baru" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 font-semibold text-primary-foreground">
            Tambah Produk
          </Link>
        </div>
      </div>
      {params.dihapus ? (
        <p role="status" className="rounded-control border border-success bg-surface px-4 py-3 text-sm font-medium text-success">
          Produk dihapus.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-muted-foreground">Belum ada produk. Tambahkan produk pertama.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden" aria-label="Daftar produk">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/produk/${p.id}`} className="flex gap-3 rounded-card bg-surface p-3">
                  {p.mainImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                    <img src={p.mainImage.url} alt="" className="h-16 w-16 shrink-0 rounded-control object-cover" />
                  ) : null}
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-sm text-muted-foreground">{p.categoryName}</span>
                    <Price price={p.price} salePrice={p.salePrice} />
                    <Flags p={p} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-card bg-surface md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Daftar produk</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className="p-3">
                    Produk
                  </th>
                  <th scope="col" className="p-3">
                    Kategori
                  </th>
                  <th scope="col" className="p-3">
                    Harga
                  </th>
                  <th scope="col" className="p-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <Link href={`/admin/produk/${p.id}`} className="flex items-center gap-3 font-semibold text-primary underline underline-offset-4">
                        {p.mainImage ? (
                          // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                          <img src={p.mainImage.url} alt="" className="h-10 w-10 rounded-control object-cover" />
                        ) : null}
                        {p.name}
                      </Link>
                    </td>
                    <td className="p-3">{p.categoryName}</td>
                    <td className="p-3">
                      <Price price={p.price} salePrice={p.salePrice} />
                    </td>
                    <td className="p-3">
                      <Flags p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
