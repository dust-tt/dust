import { isConversationEventAllowedForAuth } from "@app/lib/api/assistant/conversation";
import {
  getConversationEvents,
  getConversationEventsBatch,
} from "@app/lib/api/assistant/pubsub";
import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationError } from "@app/types/assistant/conversation";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { pollEvents } from "@front-api/lib/api/sse/poll_events";
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

export const PRIVATE_CONVERSATION_EVENTS_OPTIONS: ConversationEventsOptions = {
  transformEvent: async (auth, event) =>
    (await isConversationEventAllowedForAuth(auth, { event: event.data }))
      ? event
      : null,
};

// Shared orchestration for both the v1 (public API) and private SSE
// conversation-events routes; each supplies its own `transformEvent`. Public-API
// stability rules ([api-backward-compatibility]) apply to whatever the v1 caller emits.
export async function streamConversationEventsForRoute(
  ctx: Context,
  auth: Authenticator,
  {
    conversationId,
    lastEventId,
  }: { conversationId: string; lastEventId: string | null },
  opts: ConversationEventsOptions,
  transport: "sse" | "poll" = "sse"
) {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return apiErrorForConversation(
      ctx,
      new ConversationError("conversation_not_found")
    );
  }

  if (transport === "poll") {
    return pollEvents(ctx, async (signal) => {
      const batch = await getConversationEventsBatch({
        conversationId: conversation.sId,
        lastEventId,
        signal,
      });
      const events: string[] = [];
      for (const event of batch) {
        const transformed = await opts.transformEvent(auth, event);
        if (transformed !== null) {
          events.push(JSON.stringify(transformed));
        }
      }
      return { events, lastEventId: batch.at(-1)?.eventId ?? lastEventId };
    });
  }

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getConversationEvents({
        conversationId: conversation.sId,
        lastEventId,
        signal,
      }),
    transform: (event) => opts.transformEvent(auth, event),
    writeDoneSentinel: true,
  });
}
