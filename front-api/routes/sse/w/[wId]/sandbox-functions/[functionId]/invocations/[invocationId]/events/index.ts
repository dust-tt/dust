import {
  SandboxFunctionInvocationEventParamSchema,
  streamSandboxFunctionInvocationEventsForRoute,
} from "@front-api/lib/api/sse/sandbox_function_invocation_events";
import { EventTransportQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

// Mounted at /api/sse/w/:wId/sandbox-functions/:functionId/invocations/:invocationId/events.
import poll from "./poll";

const app = workspaceApp();

app.use("*", withSandboxFunctionInvocationFeature());

/** @ignoreswagger Internal event endpoint: SSE by default; transport=poll returns JSON event batches. */
app.get(
  "/",
  validate("param", SandboxFunctionInvocationEventParamSchema),
  validate("query", EventTransportQuerySchema),
  (ctx) => {
    const { functionId, invocationId } = ctx.req.valid("param");
    const { lastEventId, transport } = ctx.req.valid("query");
    return streamSandboxFunctionInvocationEventsForRoute(
      ctx,
      ctx.var.auth,
      {
        functionId,
        invocationId,
        lastEventId,
      },
      transport
    );
  }
);

app.route("/poll", poll);

export default app;
