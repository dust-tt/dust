import type { Context } from "hono";

// Redirects an SSE path to its /api/sse counterpart with a 307 so the ingress
// routes it to dedicated front-sse pods. Mirrors the Next middleware redirect in
// front/lib/api/sse_redirect.ts.
//
// The Location is relative (path + query only) on purpose. front-api runs as a
// plain-HTTP server behind a TLS-terminating ingress, so ctx.req.url's scheme is
// "http". An absolute Location would therefore downgrade https -> http, and HTTP
// clients (e.g. the CLI's reqwest) strip the Authorization header on a protocol
// downgrade, producing a 401 on the redirected request. A relative Location is
// resolved by the client against the original https request URI, preserving the
// scheme, origin, and Authorization header.
export function redirectToSse(ctx: Context) {
  const url = new URL(ctx.req.url);
  const ssePath = url.pathname.replace(/^\/api\//, "/api/sse/");
  return ctx.redirect(`${ssePath}${url.search}`, 307);
}
