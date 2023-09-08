import {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  runAgent,
} from "@app/lib/api/assistant/agent";
import { GenerationTokensEvent } from "@app/lib/api/assistant/generation";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentConfiguration,
  AgentMessage,
  AgentRetrievalAction,
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
  const conversation = await Conversation.create({
    sId: generateModelSId(),
    title: title,
    visibility: visibility,
  });

  return {
    id: conversation.id,
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
  auth: Authenticator,
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
      if (m.agentConfiguration) {
        return {
          id: m.id,
          configurationId: m.agentConfiguration.sId,
        };
      }
      if (m.user) {
        return {
          id: m.id,
          provider: m.user.provider,
          providerId: m.user.providerId,
        };
      }
      throw new Error("Unreachable: mention must be either agent or user");
    }),
    message: userMessage.message,
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
    AgentConfiguration.findOne({
      where: {
        id: agentMessage.agentConfigurationId,
      },
    }),
    (async () => {
      if (agentMessage.agentRetrievalActionId) {
        return await AgentRetrievalAction.findOne({
          where: {
            id: agentMessage.agentRetrievalActionId,
          },
        });
      }
      return null;
    })(),
  ]);

  if (!agentConfiguration) {
    throw new Error(
      `Agent configuration ${agentMessage.agentConfigurationId} not found`
    );
  }

  return {
    id: message.id,
    sId: message.sId,
    type: "agent_message",
    visibility: message.visibility,
    version: message.version,
    parentMessageId: null,
    status: agentMessage.status,
    action: agentRetrievalAction
      ? {
          id: agentRetrievalAction.id,
          type: "retrieval_action",
          params: {
            dataSources: [], // TODO
            query: agentRetrievalAction.query,
            relativeTimeFrame: null, // TODO
            topK: agentRetrievalAction.topK,
          },
          documents: [], // TODO
        }
      : null,
    message: agentMessage.message,
    feedbacks: [],
    error: null,
    configuration: {
      sId: agentConfiguration.sId,
      status: "active",
      name: agentConfiguration.name,
      pictureUrl: agentConfiguration.pictureUrl,
      // TODO(spolu)
      action: null,
      generation: null,
    },
  };
}

export async function getConversation(
  auth: Authenticator,
  conversationId: string
): Promise<ConversationType | null> {
  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
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
        include: [
          {
            model: AgentRetrievalAction,
            as: "agentRetrievalAction",
            required: false,
          },
          {
            model: AgentConfiguration,
            as: "agentConfiguration",
            required: true,
          },
        ],
      },
    ],
  });

  const maxRank = messages.reduce((acc, m) => Math.max(acc, m.rank), -1);
  const content: (UserMessageType | AgentMessageType)[][] = Array.from(
    { length: maxRank + 1 },
    () => []
  );

  for (const message of messages) {
    if (message.userMessage) {
      //content[message.rank].push({
      //  id: message.id,
      //  sId: message.sId,
      //  type: "user_message",
      //  visibility: message.visibility,
      //  version: message.version,
      //  user: null,
      //  mentions: [],
      //  message: message.userMessage.message,
      //  context: {
      //    username: message.userMessage.userContextUsername,
      //    timezone: message.userMessage.userContextTimezone,
      //    fullName: message.userMessage.userContextFullName,
      //    email: message.userMessage.userContextEmail,
      //    profilePictureUrl: message.userMessage.userContextProfilePictureUrl,
      //  },
      //});
    }
    if (message.agentMessage) {
      // if (message.agentMessage.agentRetrievalActionId) {
      // }
      // content[message.rank].push({
      //   id: message.id,
      //   sId: message.sId,
      //   type: "agent_message",
      //   visibility: message.visibility,
      //   version: message.version,
      //   parentMessageId: null,
      //   status: message.agentMessage.status,
      //   action: null,
      //   message: message.agentMessage.message,
      //   feedbacks: [],
      //   error: null,
      //   configuration: {
      //     sId: "foo",
      //     status: "active",
      //     name: "foo", // TODO
      //     pictureUrl: null, // TODO
      //     action: null, // TODO
      //     generation: null, // TODO
      //   },
      // });
    }
  }

  return {
    id: conversation.id,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    title: conversation.title,
    visibility: conversation.visibility,
    content: [],
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

// Event sent when a new message is created (empty) and the agent is about to be executed.
export type AgentMessageNewEvent = {
  type: "agent_message_new";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageType;
};

// This method is in charge of creating a new user message in database, running the necessary agents
// in response and updating accordingly the conversation.
export async function* postUserMessage(
  auth: Authenticator,
  {
    conversation,
    message,
    mentions,
    context,
  }: {
    conversation: ConversationType;
    message: string;
    mentions: MentionType[];
    context: UserMessageContext;
  }
): AsyncGenerator<
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
                message: message,
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
        message: message,
        context: context,
      };

      const agentMessages: AgentMessageType[] = [];
      const agentMessageRows: AgentMessage[] = [];

      // for each assistant mention, create an "empty" agent message
      for (const mention of mentions) {
        if (isAgentMention(mention)) {
          // TODO(spolu): retrieve configuration from mention.
          // Mention.create({
          //   messageId: m.id,
          //   configurationId: mention.configurationId,
          // });

          const agentMessageRow = await AgentMessage.create(
            {
              // TODO(spolu): add agentConfigurationId
            },
            { transaction: t }
          );
          const m = await Message.create(
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
          agentMessageRows.push(agentMessageRow);
          agentMessages.push({
            id: m.id,
            sId: m.sId,
            type: "agent_message",
            visibility: "visible",
            version: 0,
            parentMessageId: userMessage.sId,
            status: "created",
            action: null,
            message: null,
            feedbacks: [],
            error: null,
            configuration: {
              sId: mention.configurationId,
              status: "active",
              name: "foo", // TODO
              pictureUrl: null, // TODO
              action: null, // TODO
              generation: null, // TODO
            },
          });
        }

        if (isUserMention(mention)) {
          const user = await User.findOne({
            where: {
              provider: mention.provider,
              providerId: mention.providerId,
            },
          });

          if (user) {
            await Mention.create({
              messageId: m.id,
              userId: user.id,
            });
          }
        }
      }

      return { userMessage, agentMessages, agentMessageRows };
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
      //for (let i = 0; i < agentMessages.length; i++) {
      //const agentMessage = agentMessages[i];
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
            message: event.text,
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
  }: {
    conversation: ConversationType;
    message: UserMessageType;
    content: string;
  }
): AsyncGenerator<UserMessageNewEvent | AgentErrorEvent> {
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
