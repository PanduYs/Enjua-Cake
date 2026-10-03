import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionForm } from "@/components/admin/action-form";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImages } from "@/components/admin/product-images";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getAdminProduct, listAdminCategories } from "@/server/services/admin-catalog";
import { getStorage } from "@/server/storage";

import { addProductImageAction, deleteProductAction, productImageAction, updateProductAction } from "../actions";

export const metadata: Metadata = { title: "Edit Produk" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const deps = { db: getDb(), publicBucket: getStorage().public };
  const [detail, categories] = await Promise.all([getAdminProduct(deps, id), listAdminCategories(deps)]);
  if (!detail) notFound();
  const { product, images, orderCount } = detail;
  const created = (await searchParams).dibuat;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/produk" className="self-start underline underline-offset-4">
        ← Semua produk
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl">{product.name}</h1>
        {product.isActive ? (
          <Link href={`/produk/${product.slug}`} className="text-sm underline underline-offset-4" target="_blank">
            Lihat di website
          </Link>
        ) : null}
      </div>
      {created ? (
        <p role="status" className="rounded-control border border-success bg-surface px-4 py-3 text-sm font-medium text-success">
          Produk dibuat.
        </p>
      ) : null}

      <ProductForm
        action={updateProductAction}
        categories={categories}
        defaults={{
          productId: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          categoryId: product.categoryId,
          price: String(product.price),
          salePrice: product.salePrice === null ? "" : String(product.salePrice),
          productType: product.productType,
          minimumPreorderDays: product.minimumPreorderDays === null ? "" : String(product.minimumPreorderDays),
          availability: product.availability,
          maxQuantityPerOrder: product.maxQuantityPerOrder === null ? "" : String(product.maxQuantityPerOrder),
          isFeatured: product.isFeatured,
          isActive: product.isActive,
        }}
      />

      <ProductImages
        productId={product.id}
        images={images.map((i) => ({ id: i.id, url: i.url, altText: i.altText, isMain: i.isMain }))}
        imageAction={productImageAction}
        addAction={addProductImageAction}
      />

      <section aria-labelledby="hapus-produk" className="flex flex-col gap-3 rounded-card border border-danger bg-surface p-5 text-sm">
        <h2 id="hapus-produk" className="text-xl">
          Hapus Produk
        </h2>
        {orderCount > 0 ? (
          <p>
            Produk ini sudah ada di {orderCount} item pesanan sehingga tidak dapat dihapus agar riwayat pesanan tetap utuh. Nonaktifkan produk (hapus centang &ldquo;Aktif&rdquo;) agar tidak tampil di
            website.
          </p>
        ) : (
          <ActionForm action={deleteProductAction} submitLabel="Hapus Produk" variant="danger" confirmText={`Hapus produk "${product.name}" secara permanen?`}>
            <input type="hidden" name="productId" value={product.id} />
            <p>Produk belum pernah dipesan dan dapat dihapus permanen beserta fotonya.</p>
          </ActionForm>
        )}
      </section>
    </section>
  );
}
