import { isConversationEventAllowedForAuth } from "@app/lib/api/assistant/conversation";
import { addBackwardCompatibleAgentMessageFields } from "@app/lib/api/v1/backward_compatibility";
import type { ConversationEventsOptions } from "@front-api/lib/api/sse/conversation_events";
import {
  ConversationParamSchema,
  streamConversationEventsForRoute,
} from "@front-api/lib/api/sse/conversation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";

const transformForV1: ConversationEventsOptions["transformEvent"] = async (
  auth,
  event
) => {
  if (
    event.data.type === "compaction_message_new" ||
    event.data.type === "compaction_message_done" ||
    event.data.type === "plan_updated" ||
    event.data.type === "wake_up_updated"
  ) {
    return null;
  }
  const isAllowed = await isConversationEventAllowedForAuth(auth, {
    event: event.data,
  });
  if (!isAllowed) {
    return null;
  }
  if (event.data.type === "agent_message_new") {
    return {
      eventId: event.eventId,
      data: {
        ...event.data,
        message: {
          ...event.data.message,
          ...addBackwardCompatibleAgentMessageFields(event.data.message),
        },
      },
    };
  }
  return { eventId: event.eventId, data: event.data };
};

export const V1_OPTIONS: ConversationEventsOptions = {
  transformEvent: transformForV1,
};

// Mounted at /api/sse/v1/w/:wId/assistant/conversations/:cId/events.
const app = publicApiApp();

app.use("*", streamingTag);
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
      V1_OPTIONS
    );
  }
);

export default app;
