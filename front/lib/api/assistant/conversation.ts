import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  runAgent,
} from "@app/lib/api/assistant/agent";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { GenerationTokensEvent } from "@app/lib/api/assistant/generation";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentConfiguration,
  AgentMessage,
  Conversation,
  Mention,
  Message,
  User,
  UserMessage,
} from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import {
  AgentMessageType,
  ConversationType,
  ConversationVisibility,
  isAgentMention,
  isUserMention,
  MentionType,
  UserMessageContext,
  UserMessageType,
} from "@app/types/assistant/conversation";

import { renderRetrievalActionByModelId } from "./actions/retrieval";

/**
 * Conversation Creation and Update
 */

export async function createConversation(
  auth: Authenticator,
  {
    title,
    visibility,
  }: {
    title: string | null;
    visibility: ConversationVisibility;
  }
): Promise<ConversationType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const conversation = await Conversation.create({
    sId: generateModelSId(),
    workspaceId: owner.id,
    title: title,
    visibility: visibility,
  });

  return {
    id: conversation.id,
    owner,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    title: conversation.title,
    visibility: conversation.visibility,
    content: [],
  };
}

/**
 * Conversation Rendering
 */

async function renderUserMessage(
  message: Message,
  userMessage: UserMessage
): Promise<UserMessageType> {
  const [mentions, user] = await Promise.all([
    Mention.findAll({
      where: {
        messageId: message.id,
      },
      include: [
        {
          model: User,
          as: "user",
          required: false,
        },
        {
          model: AgentConfiguration,
          as: "agentConfiguration",
          required: false,
        },
      ],
    }),
    (async () => {
      if (userMessage.userId) {
        return await User.findOne({
          where: {
            id: userMessage.userId,
          },
        });
      }
      return null;
    })(),
  ]);

  return {
    id: message.id,
    sId: message.sId,
    type: "user_message",
    visibility: message.visibility,
    version: message.version,
    user: user
      ? {
          id: user.id,
          provider: user.provider,
          providerId: user.providerId,
          username: user.username,
          email: user.email,
          name: user.name,
          image: null,
          workspaces: [],
          isDustSuperUser: false,
        }
      : null,
    mentions: mentions.map((m) => {
      if (m.agentConfigurationId) {
        return {
          configurationId: m.agentConfigurationId,
        };
      }
      if (m.user) {
        return {
          provider: m.user.provider,
          providerId: m.user.providerId,
        };
      }
      throw new Error("Unreachable: mention must be either agent or user");
    }),
    content: userMessage.content,
    context: {
      username: userMessage.userContextUsername,
      timezone: userMessage.userContextTimezone,
      fullName: userMessage.userContextFullName,
      email: userMessage.userContextEmail,
      profilePictureUrl: userMessage.userContextProfilePictureUrl,
    },
  };
}

async function renderAgentMessage(
  auth: Authenticator,
  message: Message,
  agentMessage: AgentMessage
): Promise<AgentMessageType> {
  const [agentConfiguration, agentRetrievalAction] = await Promise.all([
    getAgentConfiguration(auth, agentMessage.agentId),
    (async () => {
      if (agentMessage.agentRetrievalActionId) {
        return await renderRetrievalActionByModelId(
          agentMessage.agentRetrievalActionId
        );
      }
      return null;
    })(),
  ]);

  if (!agentConfiguration) {
    throw new Error(`Configuration ${agentMessage.agentId} not found`);
  }

  return {
    id: message.id,
    sId: message.sId,
    type: "agent_message",
    visibility: message.visibility,
    version: message.version,
    parentMessageId: null,
    status: agentMessage.status,
    action: agentRetrievalAction,
    content: agentMessage.content,
    feedbacks: [],
    error: null,
    configuration: agentConfiguration,
  };
}

export async function getConversation(
  auth: Authenticator,
  conversationId: string
): Promise<ConversationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
      workspaceId: owner.id,
    },
  });

  if (!conversation) {
    return null;
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
    },
    order: [
      ["rank", "ASC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: false,
      },
      {
        model: AgentMessage,
        as: "agentMessage",
        required: false,
      },
    ],
  });

  const render = await Promise.all(
    messages.map((message) => {
      return (async () => {
        if (message.userMessage) {
          const m = await renderUserMessage(message, message.userMessage);
          return { m, rank: message.rank, version: message.version };
        }
        if (message.agentMessage) {
          const m = await renderAgentMessage(
            auth,
            message,
            message.agentMessage
          );
          return { m, rank: message.rank, version: message.version };
        }
        throw new Error("Unreachable: message must be either user or agent");
      })();
    })
  );

  render.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return a.version - b.version;
  });

  // We need to escape the type system here to create content. We pre-create an array that will hold
  // the versions of each User/Assistant message. The lenght of that array is by definition the
  // maximal rank of the conversation messages we just retrieved. In the case there is no message
  // the rank is -1 and the array length is 0 as expected.
  const content: any[] = Array.from(
    { length: messages.reduce((acc, m) => Math.max(acc, m.rank), -1) + 1 },
    () => []
  );

  for (const { m, rank } of render) {
    content[rank] = [...content[rank], m];
  }

  return {
    id: conversation.id,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    owner,
    title: conversation.title,
    visibility: conversation.visibility,
    content,
  };
}

export async function updateConversation(
  auth: Authenticator,
  conversationId: string,
  {
    title,
    visibility,
  }: {
    title: string | null;
    visibility: ConversationVisibility;
  }
): Promise<ConversationType> {
  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
    },
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  await conversation.update({
    title: title,
    visibility: visibility,
  });

  const c = await getConversation(auth, conversationId);

  if (!c) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  return c;
}

/**
 * Conversation API
 */

// Event sent when the user message is created.
export type UserMessageNewEvent = {
  type: "user_message_new";
  created: number;
  messageId: string;
  message: UserMessageType;
};

// Event sent when the user message is created.
export type UserMessageErrorEvent = {
  type: "user_message_error";
  created: number;
  error: {
    code: string;
    message: string;
  };
};

// Event sent when a new message is created (empty) and the agent is about to be executed.
export type AgentMessageNewEvent = {
  type: "agent_message_new";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageType;
};

// This method is in charge of creating a new user message in database, running the necessary agents
// in response and updating accordingly the conversation. AgentMentions must point to valid agent
// configurations from the same workspace or whose scope is global.
export async function* postUserMessage(
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
): AsyncGenerator<
  | UserMessageErrorEvent
  | UserMessageNewEvent
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentMessageSuccessEvent
> {
  const user = auth.user();
  const owner = auth.workspace();

  if (!owner || owner.id !== conversation.owner.id) {
    return yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    };
  }

  // In one big transaction creante all Message, UserMessage, AgentMessage and Mention rows.
  const { userMessage, agentMessages, agentMessageRows } =
    await front_sequelize.transaction(async (t) => {
      let nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;

      const m = await Message.create(
        {
          sId: generateModelSId(),
          rank: nextMessageRank++,
          conversationId: conversation.id,
          parentId: null,
          userMessageId: (
            await UserMessage.create(
              {
                content,
                userContextUsername: context.username,
                userContextTimezone: context.timezone,
                userContextFullName: context.fullName,
                userContextEmail: context.email,
                userContextProfilePictureUrl: context.profilePictureUrl,
                userId: user ? user.id : null,
              },
              { transaction: t }
            )
          ).id,
        },
        {
          transaction: t,
        }
      );

      const userMessage: UserMessageType = {
        id: m.id,
        sId: m.sId,
        type: "user_message",
        visibility: "visible",
        version: 0,
        user: user,
        mentions: mentions,
        content,
        context: context,
      };

      const results: { row: AgentMessage; m: AgentMessageType }[] =
        await Promise.all(
          mentions.filter(isAgentMention).map((mention) => {
            // For each assistant/agent mention, create an "empty" agent message.
            return (async () => {
              // `getAgentConfiguration` checks that we're only pulling a configuration from the
              // same workspace or a global one.
              const configuration = await getAgentConfiguration(
                auth,
                mention.configurationId
              );
              if (!configuration) {
                throw new Error(`Configuration not found`);
              }

              await Mention.create(
                {
                  messageId: m.id,
                  agentConfigurationId: configuration.sId,
                },
                { transaction: t }
              );

              const agentMessageRow = await AgentMessage.create(
                {
                  status: "created",
                  agentId: configuration.sId,
                },
                { transaction: t }
              );
              const messageRow = await Message.create(
                {
                  sId: generateModelSId(),
                  rank: nextMessageRank++,
                  conversationId: conversation.id,
                  parentId: userMessage.id,
                  agentMessageId: agentMessageRow.id,
                },
                {
                  transaction: t,
                }
              );

              return {
                row: agentMessageRow,
                m: {
                  id: messageRow.id,
                  sId: messageRow.sId,
                  type: "agent_message",
                  visibility: "visible",
                  version: 0,
                  parentMessageId: userMessage.sId,
                  status: "created",
                  action: null,
                  content: null,
                  feedbacks: [],
                  error: null,
                  configuration,
                },
              };
            })();
          })
        );

      await Promise.all(
        mentions.filter(isUserMention).map((mention) => {
          return (async () => {
            const user = await User.findOne({
              where: {
                provider: mention.provider,
                providerId: mention.providerId,
              },
            });

            if (user) {
              await Mention.create(
                {
                  messageId: m.id,
                  userId: user.id,
                },
                { transaction: t }
              );
            }
          })();
        })
      );

      return {
        userMessage,
        agentMessages: results.map(({ m }) => m),
        agentMessageRows: results.map(({ row }) => row),
      };
    });

  if (agentMessageRows.length !== agentMessages.length) {
    throw new Error("Unreachable: agentMessageRows and agentMessages mismatch");
  }

  yield {
    type: "user_message_new",
    created: Date.now(),
    messageId: userMessage.sId,
    message: userMessage,
  };

  await Promise.allSettled(
    agentMessages.map(async function* (agentMessage, i) {
      const agentMessageRow = agentMessageRows[i];

      yield {
        type: "agent_message_new",
        created: Date.now(),
        configurationId: agentMessage.configuration.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
      };

      // For each agent we stitch the conversation to add the user message and only that agent message
      // so that it can be used to prompt the agent.
      const eventStream = runAgent(
        auth,
        agentMessage.configuration,
        {
          ...conversation,
          content: [...conversation.content, [userMessage], [agentMessage]],
        },
        userMessage,
        agentMessage
      );

      for await (const event of eventStream) {
        if (event.type === "agent_error") {
          // Store error in database.
          await agentMessageRow.update({
            status: "failed",
            errorCode: event.error.code,
            errorMessage: event.error.message,
          });
          yield event;
        }

        if (event.type === "agent_action_success") {
          // Store action in database.
          if (event.action.type === "retrieval_action") {
            await agentMessageRow.update({
              agentRetrievalActionId: event.action.id,
            });
          } else {
            throw new Error(
              `Action type ${event.action.type} agent_action_success handling not implemented`
            );
          }
          yield event;
        }

        if (event.type === "agent_generation_success") {
          // Store message in database.
          await agentMessageRow.update({
            content: event.text,
          });
          yield event;
        }

        if (event.type === "agent_message_success") {
          // Update status in database.
          await agentMessageRow.update({
            status: "succeeded",
          });
          yield event;
        }

        // All other events that won't impact the database and are related to actions or tokens
        // generation.
        if (
          [
            "retrieval_params",
            "retrieval_documents",
            "generation_tokens",
          ].includes(event.type)
        ) {
          yield event;
        }
      }
    })
  );
}

// This method is in charge of re-running an agent interaction (generating a new
// AgentMessage as a result)
export async function* retryAgentMessage(
  auth: Authenticator,
  {
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AgentMessageType;
  }
): AsyncGenerator<
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentMessageSuccessEvent
> {
  yield {
    type: "agent_error",
    created: Date.now(),
    configurationId: "foo",
    messageId: "bar",
    error: {
      code: "not_implemented",
      message: "Not implemented",
    },
  };
}

// This method creates a new user message version (without re-running subsequent actions for now, in
// the future we will likely want to run new mentions).
export async function* editUserMessage(
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
): AsyncGenerator<UserMessageNewEvent | UserMessageErrorEvent> {
  if (auth.user()?.id !== message.user?.id) {
    return yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "not_allowed",
        message: "Only the author of the message can edit it",
      },
    };
  }

  const event: UserMessageNewEvent | UserMessageErrorEvent =
    await front_sequelize.transaction(async (t) => {
      const messageRow = await Message.findOne({
        where: {
          sId: message.sId,
          conversationId: conversation.id,
        },
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            required: true,
          },
        ],
      });
      if (!messageRow) {
        return {
          type: "user_message_error",
          created: Date.now(),
          messageId: message.sId,
          error: {
            code: "not_found",
            message: "Message not found",
          },
        };
      }
      const userMessageRow = messageRow.userMessage;
      if (!userMessageRow) {
        return {
          type: "user_message_error",
          created: Date.now(),
          messageId: message.sId,
          error: {
            code: "not_found",
            message: "UserMessage not found",
          },
        };
      }

      const m = await Message.create(
        {
          sId: messageRow.sId,
          rank: messageRow.rank,
          conversationId: conversation.id,
          parentId: messageRow.parentId,
          version: messageRow.version + 1,
          userMessageId: (
            await UserMessage.create(
              {
                content,
                userContextUsername: userMessageRow.userContextUsername,
                userContextTimezone: userMessageRow.userContextTimezone,
                userContextFullName: userMessageRow.userContextFullName,
                userContextEmail: userMessageRow.userContextEmail,
                userContextProfilePictureUrl:
                  userMessageRow.userContextProfilePictureUrl,
                userId: userMessageRow.userId,
              },
              { transaction: t }
            )
          ).id,
        },
        {
          transaction: t,
        }
      );

      await Promise.all(
        mentions.map((mention) => {
          return (async () => {
            if (isAgentMention(mention)) {
              const configuration = await getAgentConfiguration(
                auth,
                mention.configurationId
              );
              if (!configuration) {
                throw new Error(`Configuration not found`);
              }

              await Mention.create(
                {
                  messageId: m.id,
                  agentConfigurationId: configuration.sId,
                },
                { transaction: t }
              );
            }
            if (isUserMention(mention)) {
              const user = await User.findOne({
                where: {
                  provider: mention.provider,
                  providerId: mention.providerId,
                },
              });

              if (user) {
                await Mention.create(
                  {
                    messageId: m.id,
                    userId: user.id,
                  },
                  { transaction: t }
                );
              }
            }
          })();
        })
      );

      // TODO: handle (new) user and agent mentions. For now editing a message has no action.

      const userMessage: UserMessageType = {
        id: m.id,
        sId: m.sId,
        type: "user_message",
        visibility: message.visibility,
        version: m.version,
        user: message.user,
        mentions: message.mentions,
        content,
        context: message.context,
      };

      return {
        type: "user_message_new",
        created: Date.now(),
        messageId: userMessage.sId,
        message: userMessage,
      };
    });

  yield event;
}
