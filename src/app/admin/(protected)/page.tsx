import { requireAdmin } from "@/server/auth/session";

/** Phase 1 placeholder. Operational dashboard modules are built in Phase 6. */
export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-3xl">Dashboard</h1>
      <p>Halo, {admin.name}.</p>
      <p className="text-muted-foreground">Modul operasional (pesanan, pembayaran, kapasitas, produk, pengaturan) akan tersedia pada fase berikutnya.</p>
    </section>
  );
}
