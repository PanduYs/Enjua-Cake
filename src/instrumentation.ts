import type { Instrumentation } from "next";

/**
 * Server errors are logged once here with the digest shown to the user as the
 * reference code (IMPLEMENTATION-PLAN §29). Only the path (no query string) and
 * route are logged — never headers, cookies, or bodies.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/server/observability/logger");
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  logger.error("request_error", {
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
  });
};
