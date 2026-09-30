/**
 * Shared security response headers for front-spa Cloudflare Workers.
 *
 * Static assets are served by the Workers Static Assets layer (see `_headers`).
 * These helpers apply to Worker-generated responses: SPA fallbacks, share-frame
 * HTML rewrites, and missing-asset 404s.
 */

/** Dust-owned hosts that intentionally iframe shared Frames (marketing / blog). */
export const SHARE_FRAME_ANCESTORS =
  "'self' https://dust.tt https://*.dust.tt" as const;

/** Default framing policy for the authenticated app shell (no third-party embeds found). */
export const APP_FRAME_ANCESTORS = "'self'" as const;

/**
 * @cc [owner:security,label:security] frame-ancestors-share-vs-app
 * `/share` paths allow framing by Dust-owned hosts (`dust.tt` / `*.dust.tt`) because
 * marketing embeds shared Frames via iframe. All other app paths only allow `'self'`.
 * Do not widen to `*` or arbitrary third parties without an explicit product decision.
 */
export function frameAncestorsCsp(pathname: string): string {
  if (pathname === "/share" || pathname.startsWith("/share/")) {
    return `frame-ancestors ${SHARE_FRAME_ANCESTORS}`;
  }
  return `frame-ancestors ${APP_FRAME_ANCESTORS}`;
}

/**
 * @cc [owner:security,label:security] worker-security-headers
 * Every Worker response MUST include `X-Content-Type-Options: nosniff` and a CSP
 * `frame-ancestors` policy. `X-Frame-Options` is set only when ancestors are `'self'`
 * (SAMEORIGIN); share paths omit it so Dust-owned parents are not blocked on legacy UAs.
 */
export function applySecurityHeaders(
  response: Response,
  pathname: string
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Content-Security-Policy", frameAncestorsCsp(pathname));

  if (pathname === "/share" || pathname.startsWith("/share/")) {
    headers.delete("X-Frame-Options");
  } else {
    headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
