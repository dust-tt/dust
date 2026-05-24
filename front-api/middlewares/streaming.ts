import tracer from "@app/logger/tracer";
import { createMiddleware } from "hono/factory";

type StreamingEnv = {
  Variables: {
    streaming?: boolean;
  };
};

export const streamingTag = createMiddleware<StreamingEnv>(async (c, next) => {
  c.set("streaming", true);

  const span = tracer.scope().active();
  if (span) {
    span.setTag("streaming", true);
    span.setOperationName("hono.request.streaming");
  }
  await next();
});
