import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import type { MessageEventsOptions } from "@front-api/routes/sse/v1/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events";
import {
  MessageParamSchema,
  streamMessageEventsForRoute,
} from "@front-api/routes/sse/v1/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events";

// Mounted at /api/sse/w/:wId/assistant/conversations/:cId/messages/:mId/events.
// Handler logic lives in the v1 sibling file.

const PRIVATE_OPTIONS: MessageEventsOptions = {
  transformEvent: (_auth, event) => event,
};

const app = workspaceApp();

app.use("*", streamingTag);
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
      PRIVATE_OPTIONS
    );
  }
);

export default app;
