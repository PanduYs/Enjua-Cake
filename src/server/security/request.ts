import "server-only";

/**
 * Client IP for rate limiting. Assumes the app runs behind a trusted proxy that
 * sets X-Forwarded-For (Vercel/reverse proxy); revisit if hosting changes (TD-17).
 */
export function getClientIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return requestHeaders.get("x-real-ip")?.trim() || "unknown";
}
