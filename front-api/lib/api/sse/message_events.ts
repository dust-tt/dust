import { getConversationMessageType } from "@app/lib/api/assistant/conversation";
import type {
  MessageStreamBatchEvent,
  MessageStreamEvent,
} from "@app/lib/api/assistant/pubsub";
import {
  getMessagesEvents,
  getMessagesEventsBatch,
} from "@app/lib/api/assistant/pubsub";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { GetAgentMessageEventsResponseBody } from "@app/types/api/assistant/messages";
import {
  ConversationError,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { streamEvents } from "@front-api/lib/api/sse/stream_events";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import { z } from "zod";

export const MessageParamSchema = z.object({
  cId: z.string().min(1),
  mId: z.string().min(1),
});

export type MessageEventsOptions = {
  transformEvent: (auth: Authenticator, event: MessageStreamEvent) => unknown;
};

const MESSAGE_EVENTS_LONG_POLL_TIMEOUT_MS = 25_000;
const MESSAGE_STREAM_END_EVENT = {
  eventId: "end-of-stream",
  data: { type: "end-of-stream" },
} satisfies MessageStreamBatchEvent;

async function validateMessageEventsRequest(
  ctx: Context,
  auth: Authenticator,
  { conversationId, messageId }: { conversationId: string; messageId: string }
): Promise<Result<ConversationResource, ReturnType<typeof apiError>>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return new Err(
      apiErrorForConversation(
        ctx,
        new ConversationError("conversation_not_found")
      )
    );
  }

  const messageType = await getConversationMessageType(
    auth,
    conversation,
    messageId
  );
  if (!messageType) {
    return new Err(
      apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "message_not_found",
          message: "The message you're trying to access was not found.",
        },
      })
    );
  }
  if (messageType !== "agent_message") {
    return new Err(
      apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Events are only available for agent messages.",
        },
      })
    );
  }

  return new Ok(conversation);
}

// Shared orchestration for both the v1 (public API) and private SSE
// message-events routes; each supplies its own `transformEvent`. Public-API
// stability rules ([api-backward-compatibility]) apply to whatever the v1 caller emits.
export async function streamMessageEventsForRoute(
  ctx: Context,
  auth: Authenticator,
  {
    conversationId,
    messageId,
    lastEventId,
  }: { conversationId: string; messageId: string; lastEventId: string | null },
  opts: MessageEventsOptions
) {
  const validation = await validateMessageEventsRequest(ctx, auth, {
    conversationId,
    messageId,
  });
  if (validation.isErr()) {
    return validation.error;
  }

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getMessagesEvents(auth, { messageId, lastEventId, signal }),
    transform: (event) => opts.transformEvent(auth, event),
    writeDoneSentinel: true,
  });
}

/**
 * @cc [owner:id13,label:api;performance] terminal-empty-message-poll
 * When a non-aborted batch has no events and the persisted agent message is terminal, the response
 * MUST contain one end-of-stream event. A message still in `created` status MUST return an empty batch.
 */
export async function pollMessageEventsForRoute(
  ctx: Context,
  auth: Authenticator,
  {
    conversationId,
    messageId,
    lastEventId,
  }: { conversationId: string; messageId: string; lastEventId: string | null }
) {
  const validation = await validateMessageEventsRequest(ctx, auth, {
    conversationId,
    messageId,
  });
  if (validation.isErr()) {
    return validation.error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MESSAGE_EVENTS_LONG_POLL_TIMEOUT_MS
  );
  const onRequestAbort = () => controller.abort();
  ctx.req.raw.signal.addEventListener("abort", onRequestAbort, { once: true });

  try {
    const events = await getMessagesEventsBatch({
      messageId,
      lastEventId,
      signal: controller.signal,
    });

    if (events.length === 0 && !ctx.req.raw.signal.aborted) {
      const status = await ConversationResource.fetchAgentMessageStatus(
        auth,
        validation.value,
        messageId
      );
      if (status && isTerminalAgentMessageStatus(status)) {
        return ctx.json<GetAgentMessageEventsResponseBody>({
          events: [JSON.stringify(MESSAGE_STREAM_END_EVENT)],
        });
      }
    }

    return ctx.json<GetAgentMessageEventsResponseBody>({
      events: events.map((event) => JSON.stringify(event)),
    });
  } finally {
    clearTimeout(timeout);
    ctx.req.raw.signal.removeEventListener("abort", onRequestAbort);
  }
}
