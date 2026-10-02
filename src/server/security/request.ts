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

/** Same-origin check for mutating Route Handlers (Server Actions have their own, §30). */
export function isSameOriginRequest(requestHeaders: Headers): boolean {
  const origin = requestHeaders.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  } catch {
    return false;
  }
}

/**
 * Declared request body size, or null when the client sent no valid Content-Length.
 * Route handlers use it to refuse oversized bodies before reading them.
 */
export function declaredContentLength(requestHeaders: Headers): number | null {
  const raw = requestHeaders.get("content-length");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
