/**
 * wa.me links with pre-filled text (FD-74). Messages are built only from the
 * typed contexts below, which carry no tracking token by construction (FD-77).
 */
export type WhatsAppContext =
  | { kind: "general" }
  | { kind: "order"; orderNumber: string }
  | { kind: "cancellation"; orderNumber: string }
  | { kind: "custom-cake"; productName?: string };

export function whatsAppMessage(context: WhatsAppContext, businessName: string): string {
  switch (context.kind) {
    case "general":
      return `Halo ${businessName}, saya ingin bertanya.`;
    case "order":
      return `Halo ${businessName}, saya ingin bertanya tentang pesanan ${context.orderNumber}.`;
    case "cancellation":
      return `Halo ${businessName}, saya ingin mengajukan pembatalan pesanan ${context.orderNumber}.`;
    case "custom-cake":
      return context.productName
        ? `Halo ${businessName}, saya ingin konsultasi kustomisasi untuk ${context.productName}.`
        : `Halo ${businessName}, saya ingin konsultasi pesanan Custom Cake.`;
  }
}

/** Indonesian numbers in any common form → "628…" (digits only), or null if not plausible. */
export function normalizeWhatsAppNumber(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  let normalized: string;
  if (digits.startsWith("62")) normalized = digits;
  else if (digits.startsWith("0")) normalized = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) normalized = `62${digits}`;
  else return null;
  return /^628\d{7,11}$/.test(normalized) ? normalized : null;
}

export function buildWhatsAppLink(phoneNumber: string, context: WhatsAppContext, businessName: string): string | null {
  const number = normalizeWhatsAppNumber(phoneNumber);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(whatsAppMessage(context, businessName))}`;
}
