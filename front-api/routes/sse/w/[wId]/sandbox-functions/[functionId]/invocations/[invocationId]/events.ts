import {
  SandboxFunctionInvocationEventParamSchema,
  streamSandboxFunctionInvocationEventsForRoute,
} from "@front-api/lib/api/sse/sandbox_function_invocation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted at /api/sse/w/:wId/sandbox-functions/:functionId/invocations/:invocationId/events.
const app = workspaceApp();

app.use("*", streamingTag);
app.use(
  "*",
  withFeatureFlag("sandbox_functions", {
    message: "Sandbox Functions are not enabled for this workspace.",
  })
);

/** @ignoreswagger */
app.get(
  "/",
  validate("param", SandboxFunctionInvocationEventParamSchema),
  validate("query", SseQuerySchema),
  (ctx) => {
    const { functionId, invocationId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");
    return streamSandboxFunctionInvocationEventsForRoute(ctx, ctx.var.auth, {
      functionId,
      invocationId,
      lastEventId,
    });
  }
);

export default app;
