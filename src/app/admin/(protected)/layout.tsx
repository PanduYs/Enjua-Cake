import Link from "next/link";
import type { ReactNode } from "react";

import { AdminNavLinks } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth/session";

import { logoutAction } from "./actions";

/** Every protected page also calls requireAdmin() itself; this layout only renders the shell. */
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="font-heading text-xl">
            Enjua Cake&apos;s · Admin
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">Masuk sebagai {admin.name}</span>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary">
                Keluar
              </Button>
            </form>
          </div>
        </div>
        <nav aria-label="Navigasi admin" className="mx-auto max-w-6xl px-4 pb-3">
          <AdminNavLinks />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
