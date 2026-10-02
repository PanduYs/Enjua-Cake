import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { CreateAdminForm } from "@/components/admin/create-admin-form";
import { ADMIN_PASSWORD_MIN } from "@/lib/validation/admin-auth";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAdmins } from "@/server/services/admin-users";

import { changePasswordAction, createAdminAction, resetAdminPasswordAction, setAdminActiveAction } from "./actions";

export const metadata: Metadata = { title: "Akun" };

const input = "min-h-11 rounded-control border border-muted-foreground bg-surface px-3";

export default async function AdminAccountPage() {
  const admin = await requireAdmin();
  const admins = await listAdmins(getDb());
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl">Akun</h1>
        <p className="text-muted-foreground">{admin.email}</p>
      </div>
      <div className="max-w-md rounded-card bg-surface p-6">
        <h2 className="mb-4 text-xl">Ganti Password</h2>
        <ChangePasswordForm action={changePasswordAction} />
      </div>

      <section aria-labelledby="kelola-admin" className="flex flex-col gap-4 rounded-card bg-surface p-6">
        <h2 id="kelola-admin" className="text-xl">
          Kelola Admin
        </h2>
        <p className="text-sm text-muted-foreground">Semua admin memiliki hak akses yang sama. Admin nonaktif tidak dapat masuk.</p>
        <ul className="flex flex-col gap-3" aria-label="Daftar admin">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 rounded-control border border-border p-4" data-testid="admin-item">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{a.name}</span>
                <span className="text-sm text-muted-foreground">{a.email}</span>
                {a.id === admin.adminId ? <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">Anda</span> : null}
                {!a.isActive ? <span className="rounded-full border border-danger px-2 py-0.5 text-xs text-danger">Nonaktif</span> : null}
              </div>
              {a.id !== admin.adminId ? (
                <details className="text-sm">
                  <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Kelola {a.name}</summary>
                  <div className="mt-2 flex flex-col gap-4">
                    <ActionForm
                      action={setAdminActiveAction}
                      submitLabel={a.isActive ? "Nonaktifkan Admin" : "Aktifkan Admin"}
                      variant={a.isActive ? "danger" : "secondary"}
                      confirmText={a.isActive ? `Nonaktifkan ${a.name}? Semua sesinya akan diakhiri.` : undefined}
                    >
                      <input type="hidden" name="adminId" value={a.id} />
                      <input type="hidden" name="active" value={a.isActive ? "false" : "true"} />
                    </ActionForm>
                    <ActionForm action={resetAdminPasswordAction} submitLabel="Reset Password" variant="secondary">
                      <input type="hidden" name="adminId" value={a.id} />
                      <label htmlFor={`reset-${a.id}`} className="font-semibold">
                        Password baru untuk {a.name}
                      </label>
                      <input id={`reset-${a.id}`} name="password" type="password" autoComplete="new-password" minLength={ADMIN_PASSWORD_MIN} className={input} />
                      <label htmlFor={`reset-confirm-${a.id}`} className="font-semibold">
                        Ulangi password untuk {a.name}
                      </label>
                      <input id={`reset-confirm-${a.id}`} name="confirmPassword" type="password" autoComplete="new-password" className={input} />
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-lg">Tambah Admin</h3>
          <CreateAdminForm action={createAdminAction} />
        </div>
      </section>
    </section>
  );
}
