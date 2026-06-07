import { toPublicAgentMessageEvent } from "@app/lib/api/v1/backward_compatibility";
import type { MessageEventsOptions } from "@front-api/lib/api/sse/message_events";
import {
  MessageParamSchema,
  streamMessageEventsForRoute,
} from "@front-api/lib/api/sse/message_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";

export const V1_OPTIONS: MessageEventsOptions = {
  transformEvent: (auth, event) => toPublicAgentMessageEvent(auth, event),
};

// Mounted at /api/sse/v1/w/:wId/assistant/conversations/:cId/messages/:mId/events.
const app = publicApiApp();

app.use("*", streamingTag);
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
      V1_OPTIONS
    );
  }
);

export default app;
