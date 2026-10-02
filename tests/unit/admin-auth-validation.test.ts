import { describe, expect, it } from "vitest";

import { adminLoginSchema, changePasswordSchema } from "@/lib/validation/admin-auth";

describe("admin auth validation", () => {
  it("normalizes login email", () => {
    expect(adminLoginSchema.parse({ email: "  Admin@Example.TEST ", password: "x" }).email).toBe("admin@example.test");
  });

  it("rejects missing credentials with Indonesian messages", () => {
    const result = adminLoginSchema.safeParse({ email: "nope", password: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual(["Masukkan alamat email yang valid.", "Masukkan password."]);
  });

  it("enforces new password length, confirmation, and difference", () => {
    const ok = { currentPassword: "old-password-123", newPassword: "new-password-456", confirmPassword: "new-password-456" };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: "short", confirmPassword: "short" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, confirmPassword: "different-123456" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: ok.currentPassword, confirmPassword: ok.currentPassword }).success).toBe(false);
  });
});
