import { describe, expect, it } from "vitest";

import { buildWhatsAppLink, normalizeWhatsAppNumber, whatsAppMessage } from "@/lib/whatsapp";

describe("WhatsApp links (FD-74..77)", () => {
  it("normalizes Indonesian number formats", () => {
    expect(normalizeWhatsAppNumber("081234567890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("6281234567890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("81234567890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
    expect(normalizeWhatsAppNumber("0211234567")).toBeNull(); // landline, not WhatsApp mobile
  });

  it("builds wa.me links with encoded pre-filled text", () => {
    const link = buildWhatsAppLink("081234567890", { kind: "general" }, "Enjua Cake's");
    expect(link).toBe(`https://wa.me/6281234567890?text=${encodeURIComponent("Halo Enjua Cake's, saya ingin bertanya.")}`);
    expect(buildWhatsAppLink("bukan nomor", { kind: "general" }, "X")).toBeNull();
  });

  it("may include the order number but never anything else about the order", () => {
    const message = whatsAppMessage({ kind: "order", orderNumber: "ENC-20261002-7K3P" }, "Enjua Cake's");
    expect(message).toContain("ENC-20261002-7K3P");
    // Contexts are typed: there is no field through which a tracking token could be passed.
    const cancellation = whatsAppMessage({ kind: "cancellation", orderNumber: "ENC-20261002-7K3P" }, "Enjua Cake's");
    expect(cancellation).toMatch(/pembatalan pesanan ENC-20261002-7K3P\.$/);
  });

  it("supports the Custom Cake inquiry context", () => {
    expect(whatsAppMessage({ kind: "custom-cake", productName: "Kue Ulang Tahun" }, "E")).toContain("Kue Ulang Tahun");
    expect(whatsAppMessage({ kind: "custom-cake" }, "E")).toContain("Custom Cake");
  });
});
