import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
  AgentGenerationTokensEvent,
  AgentMessageNewEvent,
} from "@app/lib/api/assistant/agent";
import {
  postUserMessage,
  UserMessageNewEvent,
} from "@app/lib/api/assistant/conversation";
import { redisClient } from "@app/lib/redis";

type PostUserMessageParams = Parameters<typeof postUserMessage>;

export async function postUserMessageWithPubSub(
  ...args: PostUserMessageParams
) {
  const client = await redisClient();
  for await (const event of postUserMessage(...args)) {
    switch (event.type) {
      case "user_message_new":
      case "agent_message_new": {
        const pubsubChannel = getConversationChannelId(
          args[1].conversation.sId
        );
        await client.xAdd(pubsubChannel, "*", {
          payload: JSON.stringify(event),
        });
        break;
      }
      // missing retrieval_documents because it does not have a messageId field.
      case "agent_generation_tokens":
      case "agent_error":
      case "agent_action_success":
      case "retrieval_documents": {
        const pubsubChannel = getMessageChannelId(event.messageId);
        await client.xAdd(pubsubChannel, "*", {
          payload: JSON.stringify(event),
        });
        break;
      }
      case "agent_generation_success": {
        const pubsubChannel = getMessageChannelId(event.message.sId);
        await client.xAdd(pubsubChannel, "*", {
          payload: JSON.stringify(event),
        });
        break;
      }

      default:
        throw new Error(`Unhandled event. ${event.type}`);
    }
  }
}

export async function* getConversationEvents(
  conversationSID: string,
  lastEventId: string | null
): AsyncGenerator<{
  eventId: string;
  data: UserMessageNewEvent | AgentMessageNewEvent;
}> {
  const pubsubChannel = getConversationChannelId(conversationSID);
  const client = await redisClient();
  const events = await client.xRead(
    { key: pubsubChannel, id: lastEventId ? lastEventId : "0-0" },
    { COUNT: 1, BLOCK: 10000 }
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

export async function* getMessagesEvents(
  messageSID: string,
  lastEventId: string | null
): AsyncGenerator<{
  eventId: string;
  data:
    | AgentErrorEvent
    | AgentActionEvent
    | AgentActionSuccessEvent
    | AgentGenerationTokensEvent
    | AgentGenerationSuccessEvent;
}> {
  const pubsubChannel = getMessageChannelId(messageSID);
  const client = await redisClient();
  const events = await client.xRead(
    { key: pubsubChannel, id: lastEventId ? lastEventId : "0-0" },
    { COUNT: 1, BLOCK: 10000 }
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
