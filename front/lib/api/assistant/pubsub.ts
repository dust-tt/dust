import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
} from "@app/lib/api/assistant/agent";
import {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  editUserMessage,
  postUserMessage,
  retryAgentMessage,
  UserMessageErrorEvent,
  UserMessageNewEvent,
} from "@app/lib/api/assistant/conversation";
import { GenerationTokensEvent } from "@app/lib/api/assistant/generation";
import { Authenticator } from "@app/lib/auth";
import { redisClient } from "@app/lib/redis";
import logger from "@app/logger/logger";
import {
  AgentMessageType,
  ConversationType,
  MentionType,
  UserMessageContext,
  UserMessageType,
} from "@app/types/assistant/conversation";

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
): Promise<UserMessageType> {
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
): Promise<UserMessageType> {
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
    | AgentMessageSuccessEvent
    | ConversationTitleEvent,
    void
  >
): Promise<UserMessageType> {
  const promise: Promise<UserMessageType> = new Promise((resolve, reject) => {
    void (async () => {
      const redis = await redisClient();
      let didResolve = false;
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
                didResolve = true;
                resolve(event.message);
              }
              break;
            }
            case "retrieval_params":
            case "agent_error":
            case "agent_action_success":
            case "generation_tokens":
            case "agent_generation_success":
            case "agent_message_success": {
              const pubsubChannel = getMessageChannelId(event.messageId);
              await redis.xAdd(pubsubChannel, "*", {
                payload: JSON.stringify(event),
              });
              await redis.expire(pubsubChannel, 60 * 10);
              break;
            }
            case "user_message_error": {
              // We reject the promise here which means we'll get a 500 in the route calling
              // postUserMessageWithPubSub. This is fine since `user_message_error` can only happen
              // if we're trying to send a message to a conversation that we don't have access to,
              // or this has already been checked if getConversation has been called.
              reject(new Error(event.error.message));
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
          reject(
            new Error(
              `Never got the user_message_new event for ${conversation.sId}`
            )
          );
        }
      }
    })();
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
): Promise<AgentMessageType> {
  const promise: Promise<AgentMessageType> = new Promise((resolve, reject) => {
    void (async () => {
      const redis = await redisClient();
      let didResolve = false;
      try {
        for await (const event of retryAgentMessage(auth, {
          conversation,
          message,
        })) {
          switch (event.type) {
            case "agent_message_new": {
              const pubsubChannel = getConversationChannelId(conversation.sId);
              await redis.xAdd(pubsubChannel, "*", {
                payload: JSON.stringify(event),
              });
              await redis.expire(pubsubChannel, 60 * 10);
              didResolve = true;
              resolve(event.message);
              break;
            }
            case "retrieval_params":
            case "agent_error":
            case "agent_action_success":
            case "generation_tokens":
            case "agent_generation_success":
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
          reject(
            new Error(
              `Never got the agent_message_new event for ${conversation.sId}`
            )
          );
        }
      }
    })();
  });

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
