import type { Context } from "hono";

// Redirects an SSE path to its /api/sse counterpart with a 307 so the ingress
// routes it to dedicated front-sse pods. Mirrors the Next middleware redirect in
// front/lib/api/sse_redirect.ts.
export function redirectToSse(ctx: Context) {
  const url = new URL(ctx.req.url);
  const ssePath = url.pathname.replace(/^\/api\//, "/api/sse/");
  const sseUrl = `${url.origin}${ssePath}${url.search}`;
  return ctx.redirect(sseUrl, 307);
}
