import { PUBLIC_FRAME_INVOCATION_TOKEN_HEADER } from "@app/types/api/sandbox_functions";
import {
  PublicFrameFunctionInvocationEventParamSchema,
  streamPublicFrameFunctionInvocationEventsForRoute,
} from "@front-api/lib/api/sse/public_frame_function_invocation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/sse/v1/public/frames/:token/invocations/:invocationId/events/poll.
const app = unauthedApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", PublicFrameFunctionInvocationEventParamSchema),
  validate("query", SseQuerySchema),
  async (ctx) => {
    const { token, invocationId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");

    return streamPublicFrameFunctionInvocationEventsForRoute(
      ctx,
      {
        token,
        invocationId,
        lastEventId,
        resultToken: ctx.req.header(PUBLIC_FRAME_INVOCATION_TOKEN_HEADER),
      },
      "poll"
    );
  }
);

export default app;
