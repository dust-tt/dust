export const SHARE_FRAME_ANCESTORS =
  "'self' https://dust.tt https://*.dust.tt" as const;

export const APP_FRAME_ANCESTORS = "'self'" as const;

export function frameAncestorsCsp(pathname: string): string {
  if (pathname === "/share" || pathname.startsWith("/share/")) {
    return `frame-ancestors ${SHARE_FRAME_ANCESTORS}`;
  }
  return `frame-ancestors ${APP_FRAME_ANCESTORS}`;
}

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
