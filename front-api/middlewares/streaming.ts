import tracer from "@app/logger/tracer";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

type StreamingEnv = {
  Variables: {
    streaming?: boolean;
  };
};

/**
 * Sets the standard Server-Sent Events response headers. Call before returning
 * a `stream(...)` response so the client and any proxies treat the response as
 * an un-buffered, un-encoded SSE stream.
 */
export function setSSEHeaders(ctx: Context): void {
  ctx.header("Content-Type", "text/event-stream");
  ctx.header("Cache-Control", "no-cache");
  ctx.header("Connection", "keep-alive");
  ctx.header("X-Accel-Buffering", "no");
  ctx.header("Content-Encoding", "none");
}

export const streamingTag = createMiddleware<StreamingEnv>(async (c, next) => {
  c.set("streaming", true);

  const span = tracer.scope().active();
  if (span) {
    span.setTag("streaming", true);
  }
  await next();
});
