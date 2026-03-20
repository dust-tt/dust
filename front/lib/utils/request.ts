/**
 * Extracts the client IP from request headers.
 * Uses Cloudflare IP where possible, falls back to x-forwarded-for where needed,
 * then socket address.
 */
export function getClientIp(req?: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  if (!req) {
    return "internal";
  }

  // Use Cloudflare IP where available, fall back to x-forwarded-for.
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string") {
    return cfIp.trim();
  }

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress ?? "internal";
}
