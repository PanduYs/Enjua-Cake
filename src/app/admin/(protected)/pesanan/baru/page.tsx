import type { Metadata } from "next";
import Link from "next/link";

import { ManualOrderForm } from "@/components/admin/manual-order-form";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listManualOrderProducts } from "@/server/services/manual-order";

import { capacityForDateAction, placeManualOrderAction } from "./actions";

export const metadata: Metadata = { title: "Manual Order" };

export default async function ManualOrderPage() {
  await requireAdmin();
  const products = await listManualOrderProducts(getDb());
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/pesanan" className="self-start underline underline-offset-4">
        ← Semua pesanan
      </Link>
      <div>
        <h1 className="text-3xl">Manual Order</h1>
        <p className="text-muted-foreground">Catat pesanan dari WhatsApp atau offline. Memakai validasi dan kapasitas yang sama dengan pesanan website.</p>
      </div>
      {products.length === 0 ? (
        <p className="rounded-card bg-surface p-6">Belum ada produk aktif untuk dipesan.</p>
      ) : (
        <ManualOrderForm products={products} placeOrder={placeManualOrderAction} loadCapacity={capacityForDateAction} />
      )}
    </section>
  );
}
