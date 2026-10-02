/**
 * Minimal structured application log (IMPLEMENTATION-PLAN §39): one JSON line per
 * event on stdout/stderr, collected by the hosting platform. Personal data and
 * credentials are redacted by key; tracking tokens, passwords, secrets, cookies,
 * signatures and proof contents must never reach the log.
 */
type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /token|password|secret|authorization|cookie|signature|session|qr|phone|whatsapp|email|body|payload|file|bytes/i;
const MAX_STRING = 300;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value !== "object") return value;
  if (depth > 4) return "[depth]";
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info") as Level;
  return LEVELS[configured] ?? LEVELS.info;
}

function write(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...(redact(fields) as Record<string, unknown>) });
  // console works in every runtime (Node.js and the edge-compiled instrumentation).
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
