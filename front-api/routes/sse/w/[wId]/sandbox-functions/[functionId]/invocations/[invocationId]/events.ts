import {
  SandboxFunctionInvocationEventParamSchema,
  streamSandboxFunctionInvocationEventsForRoute,
} from "@front-api/lib/api/sse/sandbox_function_invocation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

// Mounted at /api/sse/w/:wId/sandbox-functions/:functionId/invocations/:invocationId/events.
const app = workspaceApp();

app.use("*", streamingTag);
app.use("*", withSandboxFunctionInvocationFeature());

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
