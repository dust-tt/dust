import {
  MessageParamSchema,
  PRIVATE_MESSAGE_EVENTS_OPTIONS,
  streamMessageEventsForRoute,
} from "@front-api/lib/api/sse/message_events";
import { EventTransportQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";

import poll from "./poll";

// Mounted at /api/sse/w/:wId/assistant/conversations/:cId/messages/:mId/events.
// Handler logic lives in `@front-api/lib/api/sse/message_events`.

const app = workspaceApp();

/** @ignoreswagger Internal event endpoint: SSE by default; transport=poll returns JSON event batches. */
app.get(
  "/",
  validate("param", MessageParamSchema),
  validate("query", EventTransportQuerySchema),
  (ctx) => {
    const { cId, mId } = ctx.req.valid("param");
    const { lastEventId, transport } = ctx.req.valid("query");
    return streamMessageEventsForRoute(
      ctx,
      ctx.var.auth,
      { conversationId: cId, messageId: mId, lastEventId },
      PRIVATE_MESSAGE_EVENTS_OPTIONS,
      transport
    );
  }
);
app.route("/poll", poll);

export default app;
