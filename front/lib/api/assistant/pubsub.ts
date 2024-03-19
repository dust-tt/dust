import type {
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
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
} from "@dust-tt/types";
import type {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageErrorEvent,
  UserMessageNewEvent,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { rateLimiter } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models";
import { redisClient } from "@app/lib/redis";
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
  }
): Promise<Result<UserMessageType, PubSubError>> {
  let maxPerTimeframe: number | undefined = undefined;
  let timeframeSeconds: number | undefined = undefined;
  let rateLimitKey: string | undefined = "";
  if (auth.user()?.id) {
    maxPerTimeframe = 50;
    if (auth.isUpgraded()) {
      maxPerTimeframe = 200;
    }
    timeframeSeconds = 60 * 60 * 3;
    rateLimitKey = `postUserMessageUser:${auth.user()?.id}`;
  } else {
    maxPerTimeframe = 512;
    timeframeSeconds = 60 * 60;
    rateLimitKey = `postUserMessageWorkspace:${auth.workspace()?.id}`;
  }

  if (
    (await rateLimiter({
      key: rateLimitKey,
      maxPerTimeframe,
      timeframeSeconds,
      logger,
    })) === 0
  ) {
    return new Err({
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: `You have reached the maximum number of ${maxPerTimeframe} messages per ${Math.ceil(
          timeframeSeconds / 60
        )} minutes of your account. Please try again later.`,
      },
    });
  }
  const postMessageEvents = postUserMessage(auth, {
    conversation,
    content,
    mentions,
    context,
  });
  return handleUserMessageEvents(conversation, postMessageEvents);
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
): Promise<Result<UserMessageType, PubSubError>> {
  const editMessageEvents = editUserMessage(auth, {
    conversation,
    message,
    content,
    mentions,
  });
  return handleUserMessageEvents(conversation, editMessageEvents);
}

async function handleUserMessageEvents(
  conversation: ConversationType,
  messageEventGenerator: AsyncGenerator<
    | UserMessageErrorEvent
    | UserMessageNewEvent
    | AgentMessageNewEvent
    | AgentErrorEvent
    | AgentActionEvent
    | AgentActionSuccessEvent
    | GenerationTokensEvent
    | AgentGenerationSuccessEvent
    | AgentGenerationCancelledEvent
    | AgentMessageSuccessEvent
    | ConversationTitleEvent,
    void
  >
): Promise<Result<UserMessageType, PubSubError>> {
  const promise: Promise<Result<UserMessageType, PubSubError>> = new Promise(
    (resolve) => {
      void wakeLock(async () => {
        const redis = await redisClient();
        let didResolve = false;
        try {
          for await (const event of messageEventGenerator) {
            switch (event.type) {
              case "user_message_new":
              case "agent_message_new":
              case "conversation_title": {
                const pubsubChannel = getConversationChannelId(
                  conversation.sId
                );
                await redis.xAdd(pubsubChannel, "*", {
                  payload: JSON.stringify(event),
                });
                await redis.expire(pubsubChannel, 60 * 10);
                if (event.type === "user_message_new") {
                  didResolve = true;
                  resolve(new Ok(event.message));
                }
                break;
              }
              case "retrieval_params":
              case "dust_app_run_params":
              case "dust_app_run_block":
              case "tables_query_params":
              case "tables_query_output":
              case "agent_error":
              case "agent_action_success":
              case "generation_tokens":
              case "agent_generation_success":
              case "agent_generation_cancelled":
              case "agent_message_success": {
                const pubsubChannel = getMessageChannelId(event.messageId);
                await redis.xAdd(pubsubChannel, "*", {
                  payload: JSON.stringify(event),
                });
                await redis.expire(pubsubChannel, 60 * 10);
                break;
              }
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
                ((event: never) => {
                  logger.error("Unknown event type", event);
                })(event);
                return null;
            }
          }
        } catch (e) {
          logger.error({ error: e }, "Error Posting message");
        } finally {
          await redis.quit();
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
        const redis = await redisClient();
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
              case "tables_query_params":
              case "tables_query_output":
              case "agent_error":
              case "agent_action_success":
              case "generation_tokens":
              case "agent_generation_success":
              case "agent_generation_cancelled":
              case "agent_message_success": {
                const pubsubChannel = getMessageChannelId(event.messageId);
                await redis.xAdd(pubsubChannel, "*", {
                  payload: JSON.stringify(event),
                });
                await redis.expire(pubsubChannel, 60 * 10);
                break;
              }

              default:
                ((event: never) => {
                  logger.error("Unknown event type", event);
                })(event);
                return null;
            }
          }
        } catch (e) {
          logger.error({ error: e }, "Error Posting message");
        } finally {
          await redis.quit();
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
  const redis = await redisClient();
  const pubsubChannel = getConversationChannelId(conversationId);

  try {
    while (true) {
      const events = await redis.xRead(
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
  } finally {
    await redis.quit();
  }
}

export async function cancelMessageGenerationEvent(
  messageIds: string[]
): Promise<void> {
  const redis = await redisClient();

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
  } finally {
    await redis.quit();
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
      | AgentActionEvent
      | AgentActionSuccessEvent
      | AgentGenerationCancelledEvent
      | GenerationTokensEvent
      | AgentGenerationSuccessEvent;
  },
  void
> {
  const pubsubChannel = getMessageChannelId(messageId);
  const redis = await redisClient();

  try {
    while (true) {
      const events = await redis.xRead(
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
  } finally {
    await redis.quit();
  }
}

function getConversationChannelId(channelId: string) {
  return `conversation-${channelId}`;
}

function getMessageChannelId(messageId: string) {
  return `message-${messageId}`;
}
