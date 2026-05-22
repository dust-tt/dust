// This endpoint must exist in both front and front-api since
// it's used in both public homepage and app.

import { trackPageview } from "@app/lib/api/track_pageview";
import { getClientIp } from "@app/lib/utils/request";
import type { HandlerResult } from "@front-api/middleware/utils";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";

export type PostTrackPageviewResponseBody = {
  ok: boolean;
};

// Mounted at /api/t/pv.
const app = new Hono();

app.post("/", async (ctx): HandlerResult<PostTrackPageviewResponseBody> => {
  const connInfo = getConnInfo(ctx);
  const headers: Record<string, string> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const ipRaw = getClientIp({
    headers,
    socket: { remoteAddress: connInfo.remote.address },
  });
  const ip = ipRaw === "internal" ? undefined : ipRaw;

  const body = await ctx.req.json().catch(() => ({}));

  const result = await trackPageview({
    ip,
    cookieHeader: ctx.req.header("cookie"),
    userAgent: ctx.req.header("user-agent"),
    body,
  });

  if (result.type === "rate_limited") {
    return ctx.json({ ok: false }, 429);
  }

  return ctx.json({ ok: true });
});

export default app;
