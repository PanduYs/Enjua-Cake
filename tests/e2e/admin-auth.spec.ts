import { expect, test } from "@playwright/test";

import { E2E_ADMIN } from "./fixtures";

const NEW_PASSWORD = "e2e-password-baru-456";

// One sequential flow: the password change affects later steps.
test("admin login, change password (session rotation), logout, and re-login", async ({ page, context }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill("password-salah-999");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email atau password tidak cocok.");
  await expect(page.getByLabel("Email")).toHaveValue(E2E_ADMIN.email); // kept after React form reset

  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name.endsWith("enjua.session_token"));
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");

  await page.getByRole("link", { name: "Akun" }).click();
  await page.getByLabel("Password saat ini").fill(E2E_ADMIN.password);
  await page.getByLabel("Password baru", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Konfirmasi password baru").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Simpan Password" }).click();
  // Regression: the rotated session must be honored in the same action response.
  await expect(page.locator("form").getByRole("status")).toHaveText("Password berhasil diganti. Sesi di perangkat lain telah dikeluarkan.");
  await expect(page).toHaveURL(/\/admin\/akun$/);

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin/akun");
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
