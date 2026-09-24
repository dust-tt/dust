import type { GetAgentMessageEventsResponseBody } from "@app/types/api/assistant/messages";
import {
  MessageParamSchema,
  pollMessageEventsForRoute,
} from "@front-api/lib/api/sse/message_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", MessageParamSchema),
  validate("query", SseQuerySchema),
  async (ctx): HandlerResult<GetAgentMessageEventsResponseBody> => {
    const { cId, mId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");

    return pollMessageEventsForRoute(ctx, ctx.var.auth, {
      conversationId: cId,
      messageId: mId,
      lastEventId,
    });
  }
);

export default app;
