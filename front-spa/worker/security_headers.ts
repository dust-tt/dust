export const SHARE_FRAME_ANCESTORS = "'self' https://dust.tt" as const;

export const APP_FRAME_ANCESTORS = "'self'" as const;

/**
 * @cc [owner:zmarouf,label:security] frame-ancestors-share-vs-app
 * `/share` and `/share/*` MUST use `frame-ancestors 'self' https://dust.tt`. All other
 * pathnames MUST use `frame-ancestors 'self'`. MUST NOT widen to `*` or third-party hosts.
 */
export function frameAncestorsCsp(pathname: string): string {
  if (pathname === "/share" || pathname.startsWith("/share/")) {
    return `frame-ancestors ${SHARE_FRAME_ANCESTORS}`;
  }
  return `frame-ancestors ${APP_FRAME_ANCESTORS}`;
}

/**
 * @cc [owner:zmarouf,label:security] worker-security-headers
 * Every Worker response MUST include `X-Content-Type-Options: nosniff`,
 * `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP `frame-ancestors` policy.
 * Non-share paths MUST set `X-Frame-Options: SAMEORIGIN`. Share paths MUST omit
 * `X-Frame-Options` so dust.tt framing is not blocked on legacy UAs.
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
