import {
  FrameFunctionInvocationEventParamSchema,
  streamFrameFunctionInvocationEventsForRoute,
} from "@front-api/lib/api/sse/frame_function_invocation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import { withFramesV2FunctionsFeature } from "@front-api/middlewares/with_frames_v2_functions_feature";

const app = workspaceApp();

app.use("*", streamingTag);
app.use("*", withFramesV2FunctionsFeature());

/** @ignoreswagger */
app.get(
  "/",
  validate("param", FrameFunctionInvocationEventParamSchema),
  validate("query", SseQuerySchema),
  async (ctx) => {
    const { frameId, invocationId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");

    return streamFrameFunctionInvocationEventsForRoute(ctx, ctx.var.auth, {
      frameId,
      invocationId,
      lastEventId,
    });
  }
);

export default app;
