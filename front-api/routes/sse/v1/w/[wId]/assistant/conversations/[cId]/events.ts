// Editing this file edits both the v1 (public API) and private SSE
// conversation-events handlers — the private mirror under
// `front-api/routes/sse/w/[wId]/assistant/conversations/[cId]/events.ts`
// imports `streamConversationEventsForRoute` from here. Public-API
// stability rules ([BACK12]) apply.

import { isConversationEventAllowedForAuth } from "@app/lib/api/assistant/conversation";
import { getConversationEvents } from "@app/lib/api/assistant/pubsub";
import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import { addBackwardCompatibleAgentMessageFields } from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import {
  SseQuerySchema,
  streamEvents,
} from "@front-api/lib/api/sse/stream_events";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

type ConversationEvent = { eventId: string; data: ConversationEvents };

export const ConversationParamSchema = z.object({
  cId: z.string().min(1),
});

export type ConversationEventsOptions = {
  transformEvent: (
    auth: Authenticator,
    event: ConversationEvent
  ) => Promise<unknown | null>;
};

export async function streamConversationEventsForRoute(
  ctx: Context,
  auth: Authenticator,
  { conversationId, lastEventId }: { conversationId: string; lastEventId: string | null },
  opts: ConversationEventsOptions
) {
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const conversation = conversationRes.value;

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getConversationEvents({
        conversationId: conversation.sId,
        lastEventId,
        signal,
      }),
    transform: (event) => opts.transformEvent(auth, event),
  });
}

const transformForV1: ConversationEventsOptions["transformEvent"] = async (
  auth,
  event
) => {
  if (
    event.data.type === "compaction_message_new" ||
    event.data.type === "compaction_message_done" ||
    event.data.type === "plan_updated"
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
