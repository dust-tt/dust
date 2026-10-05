import {
  FrameFunctionInvocationEventParamSchema,
  streamFrameFunctionInvocationEventsForRoute,
} from "@front-api/lib/api/sse/frame_function_invocation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import poll from "./poll";

const app = workspaceApp();

app.use("*", streamingTag);
app.use("*", withSandboxFunctionInvocationFeature());

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

app.route("/poll", poll);

export default app;
