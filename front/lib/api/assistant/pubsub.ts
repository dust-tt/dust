import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
} from "@app/lib/api/assistant/agent";
import {
  AgentMessageNewEvent,
  postUserMessage,
  UserMessageNewEvent,
} from "@app/lib/api/assistant/conversation";
import { GenerationTokensEvent } from "@app/lib/api/assistant/generation";
import { Authenticator } from "@app/lib/auth";
import { redisClient } from "@app/lib/redis";
import logger from "@app/logger/logger";
import {
  ConversationType,
  Mention,
  UserMessageContext,
} from "@app/types/assistant/conversation";

export async function postUserMessageWithPubSub(
  auth: Authenticator,
  {
    conversation,
    message,
    mentions,
    context,
  }: {
    conversation: ConversationType;
    message: string;
    mentions: Mention[];
    context: UserMessageContext;
  }
) {
  const client = await redisClient();
  for await (const event of postUserMessage(auth, {
    conversation,
    message,
    mentions,
    context,
  })) {
    switch (event.type) {
      case "user_message_new":
      case "agent_message_new": {
        const pubsubChannel = getConversationChannelId(conversation.sId);
        await client.xAdd(pubsubChannel, "*", {
          payload: JSON.stringify(event),
        });
        break;
      }
      case "retrieval_params":
      case "agent_error":
      case "agent_action_success":
      case "retrieval_documents":
      case "generation_tokens":
      case "agent_generation_success":
      case "agent_message_success": {
        const pubsubChannel = getMessageChannelId(event.messageId);
        await client.xAdd(pubsubChannel, "*", {
          payload: JSON.stringify(event),
        });
        break;
      }

      default:
        ((blockParent: never) => {
          logger.error("Unknown event type", blockParent);
        })(event);
        return null;
    }
  }
}

export async function* getConversationEvents(
  conversationId: string,
  lastEventId: string | null
): AsyncGenerator<{
  eventId: string;
  data: UserMessageNewEvent | AgentMessageNewEvent;
}> {
  const pubsubChannel = getConversationChannelId(conversationId);
  const client = await redisClient();

  while (true) {
    const events = await client.xRead(
      { key: pubsubChannel, id: lastEventId ? lastEventId : "0-0" },
      // weird, xread does not return on new message when count is = 1. Anything over 1 works.
      { COUNT: 10, BLOCK: 60 * 1000 }
    );
    if (!events) {
      return;
    }
    for (const event of events) {
      for (const message of event.messages) {
        const payloadStr = message.message["payload"];
        const messageId = message.id;
        const payload = JSON.parse(payloadStr);
        lastEventId = messageId;
        yield {
          eventId: messageId,
          data: payload,
        };
      }
    }
  }
}

export async function* getMessagesEvents(
  messageId: string,
  lastEventId: string | null
): AsyncGenerator<{
  eventId: string;
  data:
    | AgentErrorEvent
    | AgentActionEvent
    | AgentActionSuccessEvent
    | GenerationTokensEvent
    | AgentGenerationSuccessEvent;
}> {
  const pubsubChannel = getMessageChannelId(messageId);
  const client = await redisClient();
  const events = await client.xRead(
    { key: pubsubChannel, id: lastEventId ? lastEventId : "0-0" },
    { COUNT: 10, BLOCK: 60 * 1000 }
  );
  if (!events) {
    return;
  }
  for (const event of events) {
    for (const message of event.messages) {
      const payloadStr = message.message["payload"];
      const messageId = message.id;
      const payload = JSON.parse(payloadStr);
      yield {
        eventId: messageId,
        data: payload,
      };
    }
  }
}

function getConversationChannelId(channelId: string) {
  return `conversation-${channelId}`;
}

function getMessageChannelId(messageId: string) {
  return `message-${messageId}`;
}
