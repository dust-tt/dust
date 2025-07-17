import type { AgentActionSpecificEvent } from "@app/lib/actions/types/agent";
import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import {
  getEventMessageChannelId,
  getMessageChannelId,
  isEndOfAgentMessageStreamEvent,
} from "@app/lib/api/assistant/streaming/helpers";
import { maybeTrackTokenUsageCost } from "@app/lib/api/public_api_limits";
import type { RedisUsageTagsType } from "@app/lib/api/redis";
import { getRedisClient } from "@app/lib/api/redis";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { createCallbackReader } from "@app/lib/utils";
import { wakeLock } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
import type {
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  PubSubError,
} from "@app/types";
import type { Result } from "@app/types";
import type {
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
} from "@app/types";
import type { AgentMessageNewEvent, UserMessageNewEvent } from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

function addEndOfStreamToMessageChannel({ channel }: { channel: string }) {
  return publishEvent({
    origin: "message_events",
    channel,
    event: JSON.stringify({ type: "end-of-stream" }),
  });
}

export async function retryAgentMessageWithPubSub(
  auth: Authenticator,
  {
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AgentMessageType;
  }
): Promise<Result<AgentMessageType, PubSubError>> {
  const promise: Promise<Result<AgentMessageType, PubSubError>> = new Promise(
    (resolve) => {
      void wakeLock(async () => {
        let didResolve = false;
        try {
          for await (const event of retryAgentMessage(auth, {
            conversation,
            message,
          })) {
            switch (event.type) {
              case "agent_message_new": {
                const pubsubChannel = getConversationChannelId(
                  conversation.sId
                );

                await publishEvent({
                  origin: "retry_agent_message",
                  channel: pubsubChannel,
                  event: JSON.stringify(event),
                });

                didResolve = true;
                resolve(new Ok(event.message));
                break;
              }
              case "agent_message_error": {
                didResolve = true;
                resolve(
                  new Err({
                    status_code: 400,
                    api_error: {
                      type: "invalid_request_error",
                      message: event.error.message,
                    },
                  })
                );
                break;
              }
              case "agent_action_success":
              case "agent_error":
              case "agent_generation_cancelled":
              case "agent_message_success":
              case "generation_tokens":
              case "tool_approve_execution":
              case "tool_notification":
              case "tool_params": {
                const pubsubChannel = getEventMessageChannelId(event);
                await publishEvent({
                  origin: "retry_agent_message",
                  channel: pubsubChannel,
                  event: JSON.stringify(event),
                });

                if (isEndOfAgentMessageStreamEvent(event)) {
                  // Maybe compute tokens consumed by the runs.
                  if (event.type === "agent_message_success") {
                    const { runIds } = event;

                    await maybeTrackTokenUsageCost(auth, {
                      dustRunIds: runIds,
                    });
                  }

                  await addEndOfStreamToMessageChannel({
                    channel: pubsubChannel,
                  });
                }

                break;
              }
              default:
                assertNever(event);
            }
          }
        } catch (e) {
          logger.error(
            {
              error: e,
              conversationId: conversation.sId,
              workspaceId: conversation.owner.sId,
              type: "retry_agent_message",
              agentMessageId: message.sId,
            },
            "Error Posting message"
          );
        } finally {
          if (!didResolve) {
            resolve(
              new Err({
                status_code: 500,
                api_error: {
                  type: "internal_server_error",
                  message: `Never got the user_message_new event for ${conversation.sId}`,
                },
              })
            );
          }
        }
      });
    }
  );

  return promise;
}

export async function* getConversationEvents({
  conversationId,
  lastEventId,
  signal,
}: {
  conversationId: string;
  lastEventId: string | null;
  signal: AbortSignal;
}): AsyncGenerator<
  {
    eventId: string;
    data:
      | UserMessageNewEvent
      | AgentMessageNewEvent
      | AgentGenerationCancelledEvent;
  },
  void
> {
  const pubsubChannel = getConversationChannelId(conversationId);

  const callbackReader = createCallbackReader<EventPayload | "close">();
  const { history, unsubscribe } = await getRedisHybridManager().subscribe(
    pubsubChannel,
    callbackReader.callback,
    lastEventId,
    "conversation_events"
  );

  // Unsubscribe if the signal is aborted
  signal.addEventListener("abort", unsubscribe, { once: true });

  for (const event of history) {
    yield {
      eventId: event.id,
      data: JSON.parse(event.message.payload),
    };
  }

  try {
    const TIMEOUT = 60000; // 1 minute

    // Do not loop forever, we will timeout after some time to avoid blocking the load balancer
    while (true) {
      if (signal.aborted) {
        break;
      }
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        setTimeout(() => {
          resolve("timeout");
        }, TIMEOUT);
      });
      const rawEvent = await Promise.race([
        callbackReader.next(),
        timeoutPromise,
      ]);

      // Determine if we timeouted
      if (rawEvent === "timeout") {
        break;
      }

      if (rawEvent === "close") {
        break;
      }

      const event = {
        eventId: rawEvent.id,
        data: JSON.parse(rawEvent.message.payload),
      };

      yield event;
    }
  } catch (e) {
    logger.error({ error: e }, "Error getting conversation events");
  } finally {
    unsubscribe();
  }
}

export async function cancelMessageGenerationEvent(
  auth: Authenticator,
  messageIds: string[]
): Promise<void> {
  const redis = await getRedisClient({ origin: "cancel_message_generation" });

  try {
    const tasks = messageIds.map((messageId) => {
      // Submit event to redis stream so we stop the generation
      const redisTask = redis.set(
        `assistant:generation:cancelled:${messageId}`,
        1,
        {
          EX: 3600, // 1 hour
        }
      );

      // Already set the status to cancel
      const dbTask = Message.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          sId: messageId,
        },
      }).then(async (message) => {
        if (message && message.agentMessageId) {
          await AgentMessage.update(
            { status: "cancelled" },
            { where: { id: message.agentMessageId } }
          );
        }
      });

      // Return both tasks as a single promise
      return Promise.all([redisTask, dbTask]);
    });

    await Promise.all(tasks);
  } catch (e) {
    logger.error({ error: e }, "Error cancelling message generation");
  }
}

export async function* getMessagesEvents(
  auth: Authenticator,
  {
    messageId,
    lastEventId,
    signal,
  }: { messageId: string; lastEventId: string | null; signal: AbortSignal }
): AsyncGenerator<
  {
    eventId: string;
    data:
      | AgentErrorEvent
      | AgentActionSpecificEvent
      | AgentActionSuccessEvent
      | AgentGenerationCancelledEvent
      | GenerationTokensEvent;
  },
  void
> {
  const pubsubChannel = getMessageChannelId(messageId);

  const start = Date.now();
  const TIMEOUT = 60000; // 1 minute

  const callbackReader = createCallbackReader<EventPayload | "close">();
  const { history, unsubscribe } = await getRedisHybridManager().subscribe(
    pubsubChannel,
    callbackReader.callback,
    lastEventId,
    "message_events"
  );

  // Unsubscribe if the signal is aborted
  signal.addEventListener("abort", unsubscribe, { once: true });

  try {
    for (const event of history) {
      yield {
        eventId: event.id,
        data: JSON.parse(event.message.payload),
      };
    }

    // Do not loop forever, we will timeout after some time to avoid blocking the load balancer
    while (Date.now() - start < TIMEOUT) {
      if (signal.aborted) {
        break;
      }

      const rawEvent = await callbackReader.next();

      if (rawEvent === "close") {
        break;
      }

      const event = {
        eventId: rawEvent.id,
        data: JSON.parse(rawEvent.message.payload),
      };

      // If the payload is an end-of-stream event, we stop the generator.
      if (event.data.type === "end-of-stream") {
        break;
      }

      yield event;
    }
  } catch (e) {
    logger.error({ error: e }, "Error getting messages events");
  } finally {
    unsubscribe();
  }
}

function getConversationChannelId(channelId: string) {
  return `conversation-${channelId}`;
}

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
