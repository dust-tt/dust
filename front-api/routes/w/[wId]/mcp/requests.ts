import { workspaceApp } from "@front-api/middlewares/ctx";
import type { Context } from "hono";

// Mounted at /api/w/:wId/mcp/requests.
//
// This endpoint is SSE: the actual handler lives in Hono at
// `front-api/routes/sse/w/[wId]/mcp/requests.ts`, served under the
// `/api/sse/` prefix that the ingress routes to dedicated front-sse pods.
//
// Hono only registers a 307 redirect here for two reasons:
//   1. Match the Next middleware redirect at the same path, so the routing
//      contract is the same whether the request first hits Hono or Next.
//   2. Reserve the literal `requests` segment so Hono's sibling `:serverId`
//      param route under `/mcp/` does not swallow it as a server id.
const app = workspaceApp();

const SSE_PREFIX = "/api/sse";

function redirectToSse(ctx: Context) {
  const url = new URL(ctx.req.url);
  const sseUrl = `${url.origin}${SSE_PREFIX}${url.pathname}${url.search}`;
  return ctx.redirect(sseUrl, 307);
}

app.get("/", redirectToSse);

export default app;
