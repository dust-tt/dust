import type {
  AgentDisabledErrorEvent,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  MentionType,
  PubSubError,
  UserMessageContext,
  UserMessageType,
} from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import type {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageSuccessEvent,
} from "@dust-tt/types";
import type {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageErrorEvent,
  UserMessageNewEvent,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import type { RedisClientType } from "redis";
import { commandOptions } from "redis";

import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { wakeLock } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";

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
  }: {
    conversation: ConversationType;
    content: string;
    mentions: MentionType[];
    context: UserMessageContext;
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
  });
  return handleUserMessageEvents(
    conversation,
    postMessageEvents,
    resolveAfterFullGeneration
  );
}

export async function editUserMessageWithPubSub(
  auth: Authenticator,
  {
    conversation,
    message,
    content,
    mentions,
  }: {
    conversation: ConversationType;
    message: UserMessageType;
    content: string;
    mentions: MentionType[];
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
  });
  return handleUserMessageEvents(conversation, editMessageEvents, false);
}

const END_OF_STREAM_EVENTS = ["agent_message_success", "agent_error"];

function addEndOfStreamToMessageChannel(
  redis: RedisClientType,
  streamChannel: string
) {
  return redis.xAdd(streamChannel, "*", {
    payload: JSON.stringify({ type: "end-of-stream" }),
  });
}

async function handleUserMessageEvents(
  conversation: ConversationType,
  messageEventGenerator: AsyncGenerator<
    | UserMessageErrorEvent
    | UserMessageNewEvent
    | AgentMessageNewEvent
    | AgentErrorEvent
    | AgentDisabledErrorEvent
    | AgentActionSpecificEvent
    | AgentActionSuccessEvent
    | GenerationTokensEvent
    | AgentGenerationCancelledEvent
    | AgentMessageSuccessEvent
    | ConversationTitleEvent,
    void
  >,
  resolveAfterFullGeneration = false
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
      const redis = await getRedisClient({ origin: "user_message_events" });
      let didResolve = false;

      let userMessage: UserMessageType | undefined = undefined;
      const agentMessages: AgentMessageType[] = [];
      try {
        for await (const event of messageEventGenerator) {
          switch (event.type) {
            case "user_message_new":
            case "agent_message_new":
            case "conversation_title": {
              const pubsubChannel = getConversationChannelId(conversation.sId);
              await redis.xAdd(pubsubChannel, "*", {
                payload: JSON.stringify(event),
              });
              await redis.expire(pubsubChannel, 60 * 10);
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
            case "retrieval_params":
            case "dust_app_run_params":
            case "dust_app_run_block":
            case "tables_query_started":
            case "tables_query_model_output":
            case "tables_query_output":
            case "process_params":
            case "websearch_params":
            case "browse_params":
            case "agent_error":
            case "agent_action_success":
            case "generation_tokens":
            case "agent_generation_cancelled":
            case "agent_message_success": {
              const pubsubChannel = getMessageChannelId(event.messageId);
              await redis.xAdd(pubsubChannel, "*", {
                payload: JSON.stringify(event),
              });
              await redis.expire(pubsubChannel, 60 * 10);

              if (
                event.type === "agent_message_success" &&
                resolveAfterFullGeneration
              ) {
                agentMessages.push(event.message);
              }

              if (END_OF_STREAM_EVENTS.includes(event.type)) {
                await addEndOfStreamToMessageChannel(redis, pubsubChannel);
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
            type: "handl_user_message_events",
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
        const redis = await getRedisClient({ origin: "retry_agent_message" });
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
                await redis.xAdd(pubsubChannel, "*", {
                  payload: JSON.stringify(event),
                });
                await redis.expire(pubsubChannel, 60 * 10);
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
              case "retrieval_params":
              case "dust_app_run_params":
              case "dust_app_run_block":
              case "tables_query_started":
              case "tables_query_model_output":
              case "tables_query_output":
              case "process_params":
              case "websearch_params":
              case "browse_params":
              case "agent_error":
              case "agent_action_success":
              case "generation_tokens":
              case "agent_generation_cancelled":
              case "agent_message_success": {
                const pubsubChannel = getMessageChannelId(event.messageId);
                await redis.xAdd(pubsubChannel, "*", {
                  payload: JSON.stringify(event),
                });
                await redis.expire(pubsubChannel, 60 * 10);

                if (END_OF_STREAM_EVENTS.includes(event.type)) {
                  await addEndOfStreamToMessageChannel(redis, pubsubChannel);
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

export async function* getConversationEvents(
  conversationId: string,
  lastEventId: string | null
): AsyncGenerator<
  {
    eventId: string;
    data: UserMessageNewEvent | AgentMessageNewEvent | ConversationTitleEvent;
  },
  void
> {
  const redis = await getRedisClient({ origin: "conversation_events" });
  const pubsubChannel = getConversationChannelId(conversationId);

  while (true) {
    // Use an isolated connection to avoid blocking the main connection.
    const events = await redis.xRead(
      commandOptions({ isolated: true }),
      { key: pubsubChannel, id: lastEventId ? lastEventId : "0-0" },
      { COUNT: 32, BLOCK: 60 * 1000 }
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

export async function cancelMessageGenerationEvent(
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
        where: { sId: messageId },
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
  messageId: string,
  lastEventId: string | null
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
  const redis = await getRedisClient({ origin: "message_events" });

  while (true) {
    // Use an isolated connection to avoid blocking the main connection.
    const events = await redis.xRead(
      commandOptions({ isolated: true }),
      { key: pubsubChannel, id: lastEventId ? lastEventId : "0-0" },
      { COUNT: 32, BLOCK: 60 * 1000 }
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

        // If the payload is an end-of-stream event, we stop the generator.
        if (payload.type === "end-of-stream") {
          return;
        }

        yield {
          eventId: messageId,
          data: payload,
        };
      }
    }
  }
}

function getConversationChannelId(channelId: string) {
  return `conversation-${channelId}`;
}

function getMessageChannelId(messageId: string) {
  return `message-${messageId}`;
}
