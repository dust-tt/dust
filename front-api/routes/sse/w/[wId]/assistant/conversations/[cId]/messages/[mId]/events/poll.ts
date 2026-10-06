import {
  MessageParamSchema,
  PRIVATE_MESSAGE_EVENTS_OPTIONS,
  streamMessageEventsForRoute,
} from "@front-api/lib/api/sse/message_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", MessageParamSchema),
  validate("query", SseQuerySchema),
  (ctx) => {
    const { cId, mId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");

    return streamMessageEventsForRoute(
      ctx,
      ctx.var.auth,
      { conversationId: cId, messageId: mId, lastEventId },
      PRIVATE_MESSAGE_EVENTS_OPTIONS,
      "poll"
    );
  }
);

export default app;
