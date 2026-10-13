import {
  ConversationParamSchema,
  PRIVATE_CONVERSATION_EVENTS_OPTIONS,
  streamConversationEventsForRoute,
} from "@front-api/lib/api/sse/conversation_events";
import { EventTransportQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/sse/w/:wId/assistant/conversations/:cId/events. Handler
// logic lives in `@front-api/lib/api/sse/conversation_events`.

import poll from "./poll";

const app = workspaceApp();

/** @ignoreswagger Internal event endpoint: SSE by default; transport=poll returns JSON event batches. */
app.get(
  "/",
  validate("param", ConversationParamSchema),
  validate("query", EventTransportQuerySchema),
  (ctx) => {
    const { cId } = ctx.req.valid("param");
    const { lastEventId, transport } = ctx.req.valid("query");
    return streamConversationEventsForRoute(
      ctx,
      ctx.var.auth,
      { conversationId: cId, lastEventId },
      PRIVATE_CONVERSATION_EVENTS_OPTIONS,
      transport
    );
  }
);

app.route("/poll", poll);

export default app;
