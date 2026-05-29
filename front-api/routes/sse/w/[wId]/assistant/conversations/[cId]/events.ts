import { isConversationEventAllowedForAuth } from "@app/lib/api/assistant/conversation";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import type { ConversationEventsOptions } from "@front-api/routes/sse/v1/w/[wId]/assistant/conversations/[cId]/events";
import {
  ConversationParamSchema,
  streamConversationEventsForRoute,
} from "@front-api/routes/sse/v1/w/[wId]/assistant/conversations/[cId]/events";

// Mounted at /api/sse/w/:wId/assistant/conversations/:cId/events. Handler
// logic lives in the v1 sibling file.

const PRIVATE_OPTIONS: ConversationEventsOptions = {
  transformEvent: async (auth, event) => {
    const isAllowed = await isConversationEventAllowedForAuth(auth, {
      event: event.data,
    });
    return isAllowed ? event : null;
  },
};

const app = workspaceApp();

app.use("*", streamingTag);
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
      PRIVATE_OPTIONS
    );
  }
);

export default app;
