import type { Context } from "hono";

const SSE_PREFIX = "/api/sse";

// Redirects an original (non-/api/sse) SSE path to its /api/sse counterpart with
// a 307 so the ingress routes it to dedicated front-sse pods. Mirrors the Next
// middleware redirect in front/lib/api/sse_redirect.ts.
export function redirectToSse(ctx: Context) {
  const url = new URL(ctx.req.url);
  const sseUrl = `${url.origin}${SSE_PREFIX}${url.pathname}${url.search}`;
  return ctx.redirect(sseUrl, 307);
}
