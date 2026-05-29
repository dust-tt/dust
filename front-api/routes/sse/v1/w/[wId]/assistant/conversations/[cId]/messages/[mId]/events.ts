// Editing this file edits both the v1 (public API) and private SSE
// message-events handlers — the private mirror under
// `front-api/routes/sse/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events.ts`
// imports `streamMessageEventsForRoute` from here. Public-API stability
// rules ([BACK12]) apply.

import { getConversationMessageType } from "@app/lib/api/assistant/conversation";
import { getMessagesEvents } from "@app/lib/api/assistant/pubsub";
import type { MessageStreamEvent } from "@app/lib/api/assistant/pubsub";
import { toPublicAgentMessageEvent } from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import {
  SseQuerySchema,
  streamEvents,
} from "@front-api/lib/api/sse/stream_events";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

export const MessageParamSchema = z.object({
  cId: z.string().min(1),
  mId: z.string().min(1),
});

export type MessageEventsOptions = {
  transformEvent: (auth: Authenticator, event: MessageStreamEvent) => unknown;
};

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
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const conversation = conversationRes.value;

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

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getMessagesEvents(auth, { messageId, lastEventId, signal }),
    transform: (event) => opts.transformEvent(auth, event),
  });
}

export const V1_OPTIONS: MessageEventsOptions = {
  transformEvent: (auth, event) => toPublicAgentMessageEvent(auth, event),
};

// Mounted at /api/sse/v1/w/:wId/assistant/conversations/:cId/messages/:mId/events.
const app = publicApiApp();

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
      V1_OPTIONS
    );
  }
);

export default app;
