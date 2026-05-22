import tracer from "@app/logger/tracer";
import { createMiddleware } from "hono/factory";

export const streamingTag = createMiddleware(async (_c, next) => {
  const span = tracer.scope().active();
  if (span) {
    span.setTag("streaming", true);
    span.setOperationName("hono.request.streaming");
  }
  await next();
});
