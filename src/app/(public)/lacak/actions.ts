"use server";

import { redirect } from "next/navigation";

import { clearTrackingCookie } from "@/server/security/tracking-cookie";

/** "Lacak pesanan lain": drop the current tracking session. */
export async function clearTrackingAction() {
  await clearTrackingCookie();
  redirect("/lacak");
}
