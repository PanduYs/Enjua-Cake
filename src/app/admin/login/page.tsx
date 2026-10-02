import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/login-form";
import { getAdminSession } from "@/server/auth/session";

import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Masuk Admin" };

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-3xl">Masuk Admin</h1>
        <p className="mb-6 text-muted-foreground">Enjua Cake&apos;s</p>
        <LoginForm action={loginAction} />
      </div>
    </main>
  );
}
