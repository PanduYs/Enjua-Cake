import Link from "next/link";
import type { ReactNode } from "react";

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
          <nav aria-label="Navigasi admin" className="flex flex-wrap items-center gap-2">
            <Link href="/admin" className="rounded-control px-3 py-2 underline-offset-4 hover:underline">
              Dashboard
            </Link>
            <Link href="/admin/akun" className="rounded-control px-3 py-2 underline-offset-4 hover:underline">
              Akun
            </Link>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary">
                Keluar
              </Button>
            </form>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-3 text-sm text-muted-foreground">Masuk sebagai {admin.name}</p>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
