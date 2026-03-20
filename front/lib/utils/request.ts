/**
 * Extracts the client IP from request headers.
 * Checks x-forwarded-for (for proxied requests) then falls back to socket address.
 */
export function getClientIp(req?: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  if (!req) {
    return "internal";
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "internal";
}
