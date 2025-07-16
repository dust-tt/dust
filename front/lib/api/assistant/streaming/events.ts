import {
  getConversationChannelId,
  getEventMessageChannelId,
  isEndOfAgentMessageStreamEvent,
} from "@app/lib/api/assistant/streaming/helpers";
import type {
  AgentMessageAsyncEvents,
  ConversationAsyncEvents,
} from "@app/lib/api/assistant/streaming/types";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { assertNever } from "@app/types";

async function publishConversationEvent(
  event: ConversationAsyncEvents,
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
    "user_message_events"
  );
}

async function publishMessageEvent(event: AgentMessageAsyncEvents) {
  const redisHybridManager = getRedisHybridManager();

  const messageChannel = getEventMessageChannelId(event);

  await redisHybridManager.publish(
    messageChannel,
    JSON.stringify(event),
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

export async function publishConversationRelatedEvent(
  event: AgentMessageAsyncEvents | ConversationAsyncEvents,
  {
    conversationId,
  }: {
    conversationId: string;
  }
) {
  switch (event.type) {
    case "user_message_new":
    case "agent_message_new":
      return publishConversationEvent(event, { conversationId });

    case "agent_action_success":
    case "agent_error":
    case "agent_generation_cancelled":
    case "agent_message_success":
    case "generation_tokens":
    case "tool_approve_execution":
    case "tool_notification":
    case "tool_params":
      return publishMessageEvent(event);

    default:
      assertNever(event);
  }
}
