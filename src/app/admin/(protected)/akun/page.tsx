import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { requireAdmin } from "@/server/auth/session";

import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "Akun" };

export default async function AdminAccountPage() {
  const admin = await requireAdmin();
  return (
    <section className="flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-3xl">Akun</h1>
        <p className="text-muted-foreground">{admin.email}</p>
      </div>
      <div className="rounded-card bg-surface p-6">
        <h2 className="mb-4 text-xl">Ganti Password</h2>
        <ChangePasswordForm action={changePasswordAction} />
      </div>
    </section>
  );
}
