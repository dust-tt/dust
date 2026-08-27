import { getConversationMessageType } from "@app/lib/api/assistant/conversation";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getRunOwnerUserId } from "@app/lib/api/assistant/conversation/messages";
import type { MessageStreamEvent } from "@app/lib/api/assistant/pubsub";
import { getMessagesEvents } from "@app/lib/api/assistant/pubsub";
import { redactUserMemoryFromMessageStreamEvent } from "@app/lib/api/assistant/user_memory_redaction";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { ConversationError } from "@app/types/assistant/conversation";
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

// Shared orchestration for both the v1 (public API) and private SSE
// message-events routes; each supplies its own `transformEvent`. Public-API
// stability rules ([BACK12]) apply to whatever the v1 caller emits.
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

  const messageType = await getConversationMessageType(
    auth,
    conversation,
    messageId
  );
  if (!messageType) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "The message you're trying to access was not found.",
      },
    });
  }
  if (messageType !== "agent_message") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Events are only available for agent messages.",
      },
    });
  }

  const runOwnerRes = await getRunOwnerUserId(auth, { messageId });
  if (runOwnerRes.isErr()) {
    logger.warn(
      { conversationId, messageId, err: runOwnerRes.error },
      "Could not resolve run owner; redacting user_memory from the stream."
    );
  }
  const canViewUserMemory =
    runOwnerRes.isOk() &&
    canCurrentUserRespondToParentUserMessage({
      parentUserId: runOwnerRes.value,
      currentUserId: auth.user()?.id,
    });

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getMessagesEvents(auth, { messageId, lastEventId, signal }),
    transform: (event) => {
      const redacted = canViewUserMemory
        ? event
        : redactUserMemoryFromMessageStreamEvent(event);
      return opts.transformEvent(auth, redacted);
    },
    writeDoneSentinel: true,
  });
}
