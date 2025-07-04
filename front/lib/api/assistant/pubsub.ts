import type { AgentActionSpecificEvent } from "@app/lib/actions/types/agent";
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
  AgentDisabledErrorEvent,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  MentionType,
  PubSubError,
  UserMessageContext,
  UserMessageType,
} from "@app/types";
import type { Result } from "@app/types";
import type {
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageSuccessEvent,
} from "@app/types";
import type {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageErrorEvent,
  UserMessageNewEvent,
} from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

import {
  editUserMessage,
  postUserMessage,
  retryAgentMessage,
} from "./conversation";

export async function postUserMessageWithPubSub(
  auth: Authenticator,
  {
    conversation,
    content,
    mentions,
    context,
    skipToolsValidation,
  }: {
    conversation: ConversationType;
    content: string;
    mentions: MentionType[];
    context: UserMessageContext;
    skipToolsValidation: boolean;
  },
  { resolveAfterFullGeneration }: { resolveAfterFullGeneration: boolean }
): Promise<
  Result<
    {
      userMessage: UserMessageType;
      agentMessages?: AgentMessageType[];
    },
    PubSubError
  >
> {
  const postMessageEvents = postUserMessage(auth, {
    conversation,
    content,
    mentions,
    context,
    skipToolsValidation,
  });

  return handleUserMessageEvents(auth, {
    conversation,
    generator: postMessageEvents,
    resolveAfterFullGeneration,
  });
}

export async function editUserMessageWithPubSub(
  auth: Authenticator,
  {
    conversation,
    message,
    content,
    mentions,
    skipToolsValidation,
  }: {
    conversation: ConversationType;
    message: UserMessageType;
    content: string;
    mentions: MentionType[];
    skipToolsValidation: boolean;
  }
): Promise<
  Result<
    {
      userMessage: UserMessageType;
      agentMessages?: AgentMessageType[];
    },
    PubSubError
  >
> {
  const editMessageEvents = editUserMessage(auth, {
    conversation,
    message,
    content,
    mentions,
    skipToolsValidation,
  });
  return handleUserMessageEvents(auth, {
    conversation,
    generator: editMessageEvents,
    resolveAfterFullGeneration: false,
  });
}

type AgentMessageAsyncEvents =
  | AgentErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent;

type ConversationAsyncEvents =
  | AgentMessageAsyncEvents
  | UserMessageErrorEvent
  | UserMessageNewEvent
  | AgentMessageNewEvent
  | AgentDisabledErrorEvent
  | ConversationTitleEvent;

function isEndOfStreamEvent(
  event: ConversationAsyncEvents
): event is AgentMessageSuccessEvent | AgentErrorEvent {
  return ["agent_message_success", "agent_error"].includes(event.type);
}

function addEndOfStreamToMessageChannel({ channel }: { channel: string }) {
  return publishEvent({
    origin: "message_events",
    channel,
    event: JSON.stringify({ type: "end-of-stream" }),
  });
}

async function handleUserMessageEvents(
  auth: Authenticator,
  {
    conversation,
    generator,
    resolveAfterFullGeneration = false,
  }: {
    conversation: ConversationType;
    generator: AsyncGenerator<ConversationAsyncEvents, void>;
    resolveAfterFullGeneration?: boolean;
  }
): Promise<
  Result<
    {
      userMessage: UserMessageType;
      agentMessages?: AgentMessageType[];
    },
    PubSubError
  >
> {
  const promise: Promise<
    Result<
      {
        userMessage: UserMessageType;
        agentMessages?: AgentMessageType[];
      },
      PubSubError
    >
  > = new Promise((resolve) => {
    void wakeLock(async () => {
      let didResolve = false;

      let userMessage: UserMessageType | undefined = undefined;
      const agentMessages: AgentMessageType[] = [];
      try {
        for await (const event of generator) {
          switch (event.type) {
            case "user_message_new":
            case "agent_message_new":
            case "conversation_title": {
              const pubsubChannel = getConversationChannelId(conversation.sId);

              await publishEvent({
                origin: "user_message_events",
                channel: pubsubChannel,
                event: JSON.stringify(event),
              });

              if (event.type === "user_message_new") {
                userMessage = event.message;
                if (!resolveAfterFullGeneration) {
                  didResolve = true;
                  resolve(
                    new Ok({
                      userMessage,
                    })
                  );
                }
              }
              break;
            }
            case "agent_action_success":
            case "agent_error":
            case "agent_generation_cancelled":
            case "agent_message_success":
            case "conversation_include_file_params":
            case "dust_app_run_block":
            case "dust_app_run_params":
            case "generation_tokens":
            case "search_labels_params":
            case "tool_approve_execution":
            case "tool_notification":
            case "tool_params": {
              const pubsubChannel = getEventMessageChannelId(event);

              await publishEvent({
                origin: "user_message_events",
                channel: pubsubChannel,
                event: JSON.stringify(event),
              });

              if (
                event.type === "agent_message_success" &&
                resolveAfterFullGeneration
              ) {
                agentMessages.push(event.message);
              }

              if (isEndOfStreamEvent(event)) {
                // Maybe compute tokens consumed by the runs.
                if (event.type === "agent_message_success") {
                  const { runIds } = event;

                  await maybeTrackTokenUsageCost(auth, { dustRunIds: runIds });
                }

                await addEndOfStreamToMessageChannel({
                  channel: pubsubChannel,
                });
              }
              break;
            }
            case "agent_disabled_error":
            case "user_message_error": {
              //  We resolve the promise with an error as we were not able to
              //  create the user message. This is possible for a variety of
              //  reason and will get turned into a 400 in the API route calling
              //  `{post/edit}UserMessageWithPubSub`, except for the case of used
              //  up messages for the test plan, handled separately

              didResolve = true;
              if (event.error.code === "plan_message_limit_exceeded") {
                resolve(
                  new Err({
                    status_code: 403,
                    api_error: {
                      type: "plan_message_limit_exceeded",
                      message: event.error.message,
                    },
                  })
                );
              }
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
            default:
              assertNever(event);
          }
        }
        if (resolveAfterFullGeneration && userMessage && !didResolve) {
          didResolve = true;
          resolve(
            new Ok({
              userMessage,
              agentMessages,
            })
          );
        }
      } catch (e) {
        logger.error(
          {
            error: e,
            conversationId: conversation.sId,
            workspaceId: conversation.owner.sId,
            type: "handle_user_message_events",
            userMessageId: userMessage?.sId,
            agentMessageIds: agentMessages.map((m) => m.sId),
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
                message: `Never got the resolved event for ${conversation.sId} (resolveAfterFullGeneration: ${resolveAfterFullGeneration})`,
              },
            })
          );
        }
      }
    });
  });

  return promise;
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
              case "conversation_include_file_params":
              case "dust_app_run_block":
              case "dust_app_run_params":
              case "generation_tokens":
              case "search_labels_params":
              case "tool_approve_execution":
              case "tool_notification":
              case "tool_params": {
                const pubsubChannel = getEventMessageChannelId(event);
                await publishEvent({
                  origin: "retry_agent_message",
                  channel: pubsubChannel,
                  event: JSON.stringify(event),
                });

                if (isEndOfStreamEvent(event)) {
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
      | AgentGenerationCancelledEvent
      | ConversationTitleEvent;
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

export function getEventMessageChannelId(event: AgentMessageAsyncEvents) {
  // Tool approve execution can come from a sub agent, and in that case we want to send an event
  // to the main conversation.
  if (event.type === "tool_approve_execution") {
    return getMessageChannelId(
      event.metadata.pubsubMessageId ?? event.messageId
    );
  }
  return getMessageChannelId(event.messageId);
}

export function getMessageChannelId(messageId: string) {
  return `message-${messageId}`;
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
