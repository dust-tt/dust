import {
  ConversationParamSchema,
  PRIVATE_CONVERSATION_EVENTS_OPTIONS,
  streamConversationEventsForRoute,
} from "@front-api/lib/api/sse/conversation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ConversationParamSchema),
  validate("query", SseQuerySchema),
  (ctx) => {
    const { cId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");
    return streamConversationEventsForRoute(
      ctx,
      ctx.var.auth,
      { conversationId: cId, lastEventId },
      PRIVATE_CONVERSATION_EVENTS_OPTIONS,
      "poll"
    );
  }
);

export default app;
