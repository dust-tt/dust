import {
  getConversationChannelId,
  getEventMessageChannelId,
  isEndOfAgentMessageStreamEvent,
} from "@app/lib/api/assistant/streaming/helpers";
import type {
  AgentMessageEvents,
  ConversationEvents,
} from "@app/lib/api/assistant/streaming/types";
import type { RedisUsageTagsType } from "@app/lib/api/redis";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type {
  AgentMessageNewEvent,
  AgentMessageType,
  ConversationType,
  UserMessageNewEvent,
  UserMessageType,
} from "@app/types";
import { assertNever } from "@app/types";

/**
 * Generic event publication interface.
 */
export async function publishEvent({
  origin,
  channel,
  event,
}: {
  origin: RedisUsageTagsType;
  channel: string;
  event: string;
}) {
  await getRedisHybridManager().publish(channel, event, origin);
}

/**
 * Conversation event publication interface.
 */
export async function publishConversationEvent(
  event: ConversationEvents,
  {
    conversationId,
  }: {
    conversationId: string;
  }
) {
  const redisHybridManager = getRedisHybridManager();

  const conversationChannel = getConversationChannelId({ conversationId });

  await redisHybridManager.publish(
    conversationChannel,
    JSON.stringify(event),
    "user_message_events",
    // Conversation & message initial states are setup before starting to listen to events so we really care about getting new events.
    // We are setting a low value to accommodate for reconnections to the event stream.
    5
  );
}

/**
 * Message event publication interface.
 */
async function publishMessageEvent(
  event: AgentMessageEvents,
  {
    step,
  }: {
    step: number;
  }
) {
  const redisHybridManager = getRedisHybridManager();

  const messageChannel = getEventMessageChannelId(event);

  await redisHybridManager.publish(
    messageChannel,
    JSON.stringify({ ...event, step }),
    "user_message_events"
  );

  if (isEndOfAgentMessageStreamEvent(event)) {
    await redisHybridManager.publish(
      messageChannel,
      JSON.stringify({ type: "end-of-stream" }),
      "user_message_events"
    );
  }
}

interface ConversationEventParams {
  conversationId: string;
  event: ConversationEvents;
}

interface MessageEventParams {
  conversationId: string;
  event: AgentMessageEvents;
  step: number;
}

type ConversationRelatedEventParams =
  | ConversationEventParams
  | MessageEventParams;

function isMessageEventParams(
  params: ConversationRelatedEventParams,
  eventType: AgentMessageEvents["type"] | ConversationEvents["type"]
): params is MessageEventParams {
  switch (eventType) {
    case "agent_action_success":
    case "agent_error":
    case "tool_error":
    case "agent_generation_cancelled":
    case "agent_message_success":
    case "generation_tokens":
    case "tool_approve_execution":
    case "tool_notification":
    case "tool_params":
      return true;
    case "user_message_new":
    case "agent_message_new":
    case "agent_message_done":
    case "conversation_title":
      return false;
    default:
      assertNever(eventType);
  }
}

export async function publishConversationRelatedEvent(
  a: ConversationRelatedEventParams
) {
  if (isMessageEventParams(a, a.event.type)) {
    return publishMessageEvent(a.event, {
      step: a.step,
    });
  } else {
    return publishConversationEvent(a.event, {
      conversationId: a.conversationId,
    });
  }
}

export async function publishMessageEventsOnMessagePostOrEdit(
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessages: AgentMessageType[]
) {
  const userMessageEvent: UserMessageNewEvent = {
    type: "user_message_new",
    created: Date.now(),
    messageId: userMessage.sId,
    message: userMessage,
  };

  const agentMessageEvents: AgentMessageNewEvent[] = agentMessages.map(
    (agentMessage) => {
      return {
        type: "agent_message_new",
        created: Date.now(),
        configurationId: agentMessage.configuration.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
      };
    }
  );

  return Promise.all([
    publishConversationRelatedEvent({
      event: userMessageEvent,
      conversationId: conversation.sId,
    }),
    ...agentMessageEvents.map((event) =>
      publishConversationRelatedEvent({
        event,
        conversationId: conversation.sId,
      })
    ),
  ]);
}

export async function publishAgentMessageEventOnMessageRetry(
  conversation: ConversationType,
  agentMessage: AgentMessageType
) {
  const agentMessageEvent: AgentMessageNewEvent = {
    type: "agent_message_new",
    created: Date.now(),
    configurationId: agentMessage.configuration.sId,
    messageId: agentMessage.sId,
    message: agentMessage,
  };

  return publishConversationRelatedEvent({
    event: agentMessageEvent,
    conversationId: conversation.sId,
  });
}
