/** Payment proof rules (FD-50): JPG/JPEG, PNG, PDF; at most 5 MB. */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type ProofMime = "image/jpeg" | "image/png" | "application/pdf";

export const PROOF_EXTENSION: Record<ProofMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const startsWith = (bytes: Uint8Array, signature: readonly number[]) => signature.every((b, i) => bytes[i] === b);

/** Detects the type from magic bytes only — never from the file name or client headers (§24). */
export function detectProofMime(bytes: Uint8Array): ProofMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"
  return null;
}

export type ProofFileError = "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE";

export function validateProofFile(bytes: Uint8Array): { ok: true; mime: ProofMime } | { ok: false; error: ProofFileError } {
  if (bytes.byteLength === 0) return { ok: false, error: "EMPTY" };
  if (bytes.byteLength > PROOF_MAX_BYTES) return { ok: false, error: "TOO_LARGE" };
  const mime = detectProofMime(bytes);
  return mime ? { ok: true, mime } : { ok: false, error: "UNSUPPORTED_TYPE" };
}
