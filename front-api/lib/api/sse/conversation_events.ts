import { getConversationEvents } from "@app/lib/api/assistant/pubsub";
import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { streamEvents } from "@front-api/lib/api/sse/stream_events";
import type { Context } from "hono";
import { z } from "zod";

export type ConversationEvent = { eventId: string; data: ConversationEvents };

export const ConversationParamSchema = z.object({
  cId: z.string().min(1),
});

export type ConversationEventsOptions = {
  transformEvent: (
    auth: Authenticator,
    event: ConversationEvent
  ) => Promise<unknown | null>;
};

// Shared orchestration for both the v1 (public API) and private SSE
// conversation-events routes; each supplies its own `transformEvent`. Public-API
// stability rules ([BACK12]) apply to whatever the v1 caller emits.
export async function streamConversationEventsForRoute(
  ctx: Context,
  auth: Authenticator,
  {
    conversationId,
    lastEventId,
  }: { conversationId: string; lastEventId: string | null },
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
