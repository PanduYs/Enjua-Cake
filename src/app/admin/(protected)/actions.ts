"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/server/auth";
import { getAdminSession } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { logoutAdmin } from "@/server/services/admin-auth";

export async function logoutAction(): Promise<void> {
  const session = await getAdminSession();
  await logoutAdmin({ auth: getAuth(), db: getDb(), clock: systemClock }, session?.adminId ?? null, await headers());
  redirect("/admin/login");
}
