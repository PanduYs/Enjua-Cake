import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { CategoryForm } from "@/components/admin/category-form";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAdminCategories } from "@/server/services/admin-catalog";
import { getStorage } from "@/server/storage";

import { deleteCategoryAction, saveCategoryAction } from "../produk/actions";

export const metadata: Metadata = { title: "Kategori" };

/** Category management (FD-23): real categories drive the homepage cards and catalog filter. */
export default async function AdminCategoriesPage() {
  await requireAdmin();
  const rows = await listAdminCategories({ db: getDb(), publicBucket: getStorage().public });
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/produk" className="self-start underline underline-offset-4">
        ← Produk
      </Link>
      <h1 className="text-2xl sm:text-3xl">Kategori</h1>

      {rows.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted-foreground">Belum ada kategori.</p> : null}
      <ul className="flex flex-col gap-3" aria-label="Daftar kategori">
        {rows.map((c) => (
          <li key={c.id} className="rounded-card bg-surface p-4" data-testid="category-item">
            <details>
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm text-muted-foreground">
                  /{c.slug} · {c.productCount} produk · urutan {c.sortOrder}
                </span>
                {!c.isActive ? <span className="rounded-full border border-danger px-2 py-0.5 text-xs text-danger">Nonaktif</span> : null}
              </summary>
              <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                <CategoryForm action={saveCategoryAction} category={c} />
                {c.productCount === 0 ? (
                  <ActionForm action={deleteCategoryAction} submitLabel="Hapus Kategori" variant="danger" confirmText={`Hapus kategori "${c.name}"?`}>
                    <input type="hidden" name="categoryId" value={c.id} />
                  </ActionForm>
                ) : (
                  <p className="text-sm text-muted-foreground">Kategori yang masih memiliki produk tidak dapat dihapus; nonaktifkan bila tidak ingin ditampilkan.</p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      <section aria-labelledby="kategori-baru" className="rounded-card bg-surface p-5">
        <h2 id="kategori-baru" className="mb-3 text-xl">
          Tambah Kategori
        </h2>
        <CategoryForm action={saveCategoryAction} />
      </section>
    </section>
  );
}
