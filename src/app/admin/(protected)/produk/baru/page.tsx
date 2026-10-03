import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/components/admin/product-form";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAdminCategories } from "@/server/services/admin-catalog";
import { getStorage } from "@/server/storage";

import { createProductAction } from "../actions";

export const metadata: Metadata = { title: "Tambah Produk" };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await listAdminCategories({ db: getDb(), publicBucket: getStorage().public });
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/produk" className="self-start underline underline-offset-4">
        ← Semua produk
      </Link>
      <h1 className="text-2xl sm:text-3xl">Tambah Produk</h1>
      {categories.length === 0 ? (
        <p className="rounded-card bg-surface p-6">
          Belum ada kategori. <Link href="/admin/kategori" className="font-semibold text-primary underline underline-offset-4">Buat kategori</Link> terlebih dahulu.
        </p>
      ) : (
        <ProductForm
          action={createProductAction}
          categories={categories}
          defaults={{
            name: "",
            slug: "",
            description: "",
            categoryId: "",
            price: "",
            salePrice: "",
            productType: "READY_STOCK",
            minimumPreorderDays: "",
            availability: "AVAILABLE",
            maxQuantityPerOrder: "",
            isFeatured: false,
            isActive: true,
          }}
        />
      )}
    </section>
  );
}
