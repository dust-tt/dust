import type {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  GenerationTokensEvent,
  UserMessageErrorEvent,
  UserMessageNewEvent,
  WorkspaceType,
} from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import type {
  AgentMessageType,
  ContentFragmentContentType,
  ContentFragmentContextType,
  ContentFragmentType,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  MentionType,
  UserMessageContext,
  UserMessageType,
} from "@dust-tt/types";
import type { PlanType } from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import type {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageErrorEvent,
  AgentMessageSuccessEvent,
} from "@dust-tt/types";
import { GPT_3_5_TURBO_MODEL_CONFIG } from "@dust-tt/types";
import {
  isAgentMention,
  isAgentMessageType,
  isUserMention,
  isUserMessageType,
} from "@dust-tt/types";
import { cloneBaseConfig, DustProdActionRegistry } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import crypto from "crypto";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { runActionStreamed } from "@app/lib/actions/server";
import { renderRetrievalActionByModelId } from "@app/lib/api/assistant/actions/retrieval";
import { runAgent } from "@app/lib/api/assistant/agent";
import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { renderConversationForModel } from "@app/lib/api/assistant/generation";
import type { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  AgentDatabaseQueryAction,
  AgentDustAppRunAction,
  AgentMessage,
  Conversation,
  ConversationParticipant,
  Mention,
  Message,
  User,
  UserMessage,
} from "@app/lib/models";
import { ContentFragment } from "@app/lib/models/assistant/conversation";
import { updateWorkspacePerMonthlyActiveUsersSubscriptionUsage } from "@app/lib/plans/subscription";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
/**
 * Conversation Creation, update and deletion
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
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
      workspaceId: auth.workspace()?.id,
      visibility: { [Op.ne]: "deleted" },
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
 *  Mark the conversation as deleted, but does not remove it from database
 *  unless destroy is explicitly set to true
 */
export async function deleteConversation(
  auth: Authenticator,
  {
    conversationId,
    destroy,
  }: {
    conversationId: string;
    destroy?: boolean;
  }
): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
      workspaceId: auth.workspace()?.id,
      visibility: { [Op.ne]: "deleted" },
    },
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (destroy) {
    await conversation.destroy();
  } else {
    await conversation.update({
      visibility: "deleted",
    });
  }
}

/**
 * Conversation Rendering
 */

async function batchRenderUserMessages(messages: Message[]) {
  const userMessages = messages.filter(
    (m) => m.userMessage !== null && m.userMessage !== undefined
  );
  const [mentions, users] = await Promise.all([
    Mention.findAll({
      where: {
        messageId: userMessages.map((m) => m.id),
      },
      include: [
        {
          model: User,
          as: "user",
          required: false,
        },
      ],
    }),
    (async () => {
      const userIds = userMessages
        .map((m) => m.userMessage?.userId)
        .filter((id) => !!id) as number[];
      if (userIds.length === 0) {
        return [];
      }
      return User.findAll({
        where: {
          id: userIds,
        },
      });
    })(),
  ]);

  return userMessages.map((message) => {
    if (!message.userMessage) {
      throw new Error(
        "Unreachable: batchRenderUserMessages has been filtered on user messages"
      );
    }
    const userMessage = message.userMessage;
    const messageMentions = mentions.filter((m) => m.messageId === message.id);
    const user = users.find((u) => u.id === userMessage.userId) || null;

    const m = {
      id: message.id,
      sId: message.sId,
      type: "user_message",
      visibility: message.visibility,
      version: message.version,
      created: message.createdAt.getTime(),
      user: user
        ? {
            id: user.id,
            provider: user.provider,
            providerId: user.providerId,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName:
              user.firstName + (user.lastName ? ` ${user.lastName}` : ""),
            image: null,
            workspaces: [],
          }
        : null,
      mentions: messageMentions.map((m) => {
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
    return { m, rank: message.rank, version: message.version };
  });
}

async function batchRenderAgentMessages(
  auth: Authenticator,
  messages: Message[]
) {
  const agentMessages = messages.filter((m) => !!m.agentMessage);

  const [
    agentConfigurations,
    agentRetrievalActions,
    agentDustAppRunActions,
    agentDatabaseQueryActions,
  ] = await Promise.all([
    (async () => {
      const agentConfigurationIds: string[] = agentMessages.reduce(
        (acc: string[], m) => {
          const agentId = m.agentMessage?.agentConfigurationId;
          if (agentId && !acc.includes(agentId)) {
            acc.push(agentId);
          }
          return acc;
        },
        []
      );
      const agents = (
        await Promise.all(
          agentConfigurationIds.map((agentConfigId) => {
            return getAgentConfiguration(auth, agentConfigId);
          })
        )
      ).filter((a) => a !== null) as LightAgentConfigurationType[];
      return agents;
    })(),
    (async () => {
      return Promise.all(
        agentMessages
          .filter((m) => m.agentMessage?.agentRetrievalActionId)
          .map((m) => {
            return renderRetrievalActionByModelId(
              m.agentMessage?.agentRetrievalActionId as number
            );
          })
      );
    })(),
    (async () => {
      const actions = await AgentDustAppRunAction.findAll({
        where: {
          id: {
            [Op.in]: agentMessages
              .filter((m) => m.agentMessage?.agentDustAppRunActionId)
              .map((m) => m.agentMessage?.agentDustAppRunActionId as number),
          },
        },
      });
      return actions.map((action) => {
        return {
          id: action.id,
          type: "dust_app_run_action",
          appWorkspaceId: action.appWorkspaceId,
          appId: action.appId,
          appName: action.appName,
          params: action.params,
          runningBlock: null,
          output: action.output,
        };
      });
    })(),
    (async () => {
      const actions = await AgentDatabaseQueryAction.findAll({
        where: {
          id: {
            [Op.in]: agentMessages
              .filter((m) => m.agentMessage?.agentDatabaseQueryActionId)
              .map((m) => m.agentMessage?.agentDatabaseQueryActionId as number),
          },
        },
      });
      return actions.map((action) => {
        return {
          id: action.id,
          type: "database_query_action",
          dataSourceWorkspaceId: action.dataSourceWorkspaceId,
          dataSourceId: action.dataSourceId,
          databaseId: action.databaseId,
          params: action.params,
          output: action.output,
        };
      });
    })(),
  ]);

  return agentMessages.map((message) => {
    if (!message.agentMessage) {
      throw new Error(
        "Unreachable: batchRenderAgentMessages has been filtered on agent message"
      );
    }
    const agentMessage = message.agentMessage;

    let action = null;
    if (agentMessage.agentRetrievalActionId) {
      action = agentRetrievalActions.find(
        (a) => a.id === agentMessage.agentRetrievalActionId
      );
    } else if (agentMessage.agentDustAppRunActionId) {
      action = agentDustAppRunActions.find(
        (a) => a.id === agentMessage.agentDustAppRunActionId
      );
    } else if (agentMessage.agentDatabaseQueryActionId) {
      action = agentDatabaseQueryActions.find(
        (a) => a.id === agentMessage.agentDatabaseQueryActionId
      );
    }

    const agentConfiguration = agentConfigurations.find(
      (a) => a.sId === message.agentMessage?.agentConfigurationId
    );

    let error: {
      code: string;
      message: string;
    } | null = null;

    if (agentMessage.errorCode !== null && agentMessage.errorMessage !== null) {
      error = {
        code: agentMessage.errorCode,
        message: agentMessage.errorMessage,
      };
    }

    const m = {
      id: message.id,
      sId: message.sId,
      created: message.createdAt.getTime(),
      type: "agent_message",
      visibility: message.visibility,
      version: message.version,
      parentMessageId:
        messages.find((m) => m.id === message.parentId)?.sId ?? null,
      status: agentMessage.status,
      action,
      content: agentMessage.content,
      error,
      configuration: agentConfiguration,
    };
    return { m, rank: message.rank, version: message.version };
  });
}

function renderContentFragment({
  message,
  contentFragment,
}: {
  message: Message;
  contentFragment: ContentFragment;
}): ContentFragmentType {
  return {
    id: message.id,
    sId: message.sId,
    created: message.createdAt.getTime(),
    type: "content_fragment",
    visibility: message.visibility,
    version: message.version,
    title: contentFragment.title,
    content: contentFragment.content,
    url: contentFragment.url,
    contentType: contentFragment.contentType,
    context: {
      profilePictureUrl: contentFragment.userContextProfilePictureUrl,
      fullName: contentFragment.userContextFullName,
      email: contentFragment.userContextEmail,
      username: contentFragment.userContextUsername,
    },
  };
}

async function batchRenderContentFragment(messages: Message[]) {
  const messagesWithContentFragment = messages.filter(
    (m) => !!m.contentFragment
  );
  if (messagesWithContentFragment.find((m) => !m.contentFragment)) {
    throw new Error(
      "Unreachable: batchRenderContentFragment must be called with only content fragments"
    );
  }

  return messagesWithContentFragment.map((message) => {
    if (!message.contentFragment) {
      throw new Error(
        "Unreachable: batchRenderContentFragment must be called with only content fragments"
      );
    }
    const contentFragment = message.contentFragment;

    return {
      m: renderContentFragment({ message, contentFragment }),
      rank: message.rank,
      version: message.version,
    };
  });
}

export async function getUserConversations(
  auth: Authenticator,
  includeDeleted?: boolean,
  includeTest?: boolean
): Promise<ConversationWithoutContentType[]> {
  const owner = auth.workspace();
  const user = auth.user();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  if (!user) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const participations = await ConversationParticipant.findAll({
    where: {
      userId: user.id,
      action: "posted",
    },
    include: [
      {
        model: Conversation,
        as: "conversation",
        required: true,
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  const conversations = participations.reduce<ConversationWithoutContentType[]>(
    (acc, p) => {
      if (!p.conversation) {
        logger.error("Participation without conversation");
        return acc;
      }
      if (
        p.conversation.workspaceId !== owner.id ||
        (p.conversation.visibility === "deleted" && !includeDeleted) ||
        (p.conversation.visibility === "test" && !includeTest)
      ) {
        return acc;
      }

      const conversation = {
        id: p.conversationId,
        created: p.conversation.createdAt.getTime(),
        sId: p.conversation.sId,
        owner,
        title: p.conversation.title,
      };

      return [...acc, conversation];
    },
    []
  );

  return conversations;
}

export async function getConversation(
  auth: Authenticator,
  conversationId: string,
  includeDeleted?: boolean
): Promise<ConversationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
      workspaceId: owner.id,
      ...(includeDeleted ? {} : { visibility: { [Op.ne]: "deleted" } }),
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
      {
        model: ContentFragment,
        as: "contentFragment",
        required: false,
      },
    ],
  });

  const [userMessages, agentMessages, contentFragments] = await Promise.all([
    batchRenderUserMessages(messages),
    batchRenderAgentMessages(auth, messages),
    batchRenderContentFragment(messages),
  ]);

  const render = [...userMessages, ...agentMessages, ...contentFragments];
  render.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return a.version - b.version;
  });

  // We need to escape the type system here to create content. We pre-create an array that will hold
  // the versions of each User/Assistant/ContentFragment message. The lenght of that array is by definition the
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

export async function getConversationWithoutContent(
  auth: Authenticator,
  conversationId: string,
  includeDeleted?: boolean
): Promise<ConversationWithoutContentType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
      workspaceId: owner.id,
      ...(includeDeleted ? {} : { visibility: { [Op.ne]: "deleted" } }),
    },
  });

  if (!conversation) {
    return null;
  }

  return {
    id: conversation.id,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    owner,
    title: conversation.title,
  };
}

export async function getConversationMessageType(
  auth: Authenticator,
  conversation: ConversationType | ConversationWithoutContentType,
  messageId: string
): Promise<"user_message" | "agent_message" | "content_fragment" | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await Message.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
    },
  });

  if (!message) {
    return null;
  }

  if (message.userMessageId) {
    return "user_message";
  }
  if (message.agentMessageId) {
    return "agent_message";
  }
  if (message.contentFragment) {
    return "content_fragment";
  }

  return null;
}

/**
 * Title generation
 */

export async function generateConversationTitle(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<string, Error>> {
  const model = {
    providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
    modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
  };
  const allowedTokenCount = 12288; // for 16k model.

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    prompt: "", // There is no prompt for title generation.
    allowedTokenCount,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-title-generator"].config
  );
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-v2-title-generator",
    config,
    [
      {
        conversation: modelConversationRes.value.modelConversation,
      },
    ]
  );

  if (res.isErr()) {
    return new Err(
      new Error(`Error generating conversation title: ${res.error}`)
    );
  }

  const { eventStream } = res.value;

  let title: string | null = null;

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(
          `Error generating conversation title: ${event.content.message}`
        )
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(
          new Error(`Error generating conversation title: ${e.error}`)
        );
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (v.conversation_title) {
          title = v.conversation_title;
        }
      }
    }
  }

  if (title === null) {
    return new Err(
      new Error(`Error generating conversation title: malformed output`)
    );
  }

  return new Ok(title);
}

/**
 * Conversation API
 */

async function getConversationRankVersionLock(
  conversation: ConversationType,
  t: Transaction
) {
  const now = new Date();
  // Get a lock using the unique lock key (number withing postgresql BigInt range).
  const hash = crypto
    .createHash("md5")
    .update(`conversation_message_rank_version_${conversation.id}`)
    .digest("hex");
  const lockKey = parseInt(hash, 16) % 9999999999;
  await front_sequelize.query("SELECT pg_advisory_xact_lock(:key)", {
    transaction: t,
    replacements: { key: lockKey },
  });

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      duration: new Date().getTime() - now.getTime(),
      lockKey,
    },
    "[ASSISTANT_TRACE] Advisory lock acquired"
  );
}

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
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | ConversationTitleEvent,
  void
> {
  const user = auth.user();
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const plan = subscription?.plan;

  if (!owner || owner.id !== conversation.owner.id || !subscription || !plan) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    };
    return;
  }
  // Check plan limit
  const isAboveMessageLimit = await isMessagesLimitReached({ owner, plan });
  if (isAboveMessageLimit) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "test_plan_message_limit_reached",
        message: "The free plan message limit has been reached.",
      },
    };
    return;
  }

  // In one big transaction creante all Message, UserMessage, AgentMessage and Mention rows.
  const { userMessage, agentMessages, agentMessageRows } =
    await front_sequelize.transaction(async (t) => {
      await getConversationRankVersionLock(conversation, t);

      let nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;

      async function createMessageAndUserMessage() {
        return Message.create(
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
      }
      async function createOrUpdateParticipation() {
        if (user) {
          const participant = await ConversationParticipant.findOne({
            where: {
              conversationId: conversation.id,
              userId: user.id,
            },
            transaction: t,
          });
          if (participant) {
            return participant.update(
              {
                action: "posted",
              },
              { transaction: t }
            );
          } else {
            return ConversationParticipant.create(
              {
                conversationId: conversation.id,
                userId: user.id,
                action: "posted",
              },
              { transaction: t }
            );
          }
        }
      }
      const result = await Promise.all([
        createMessageAndUserMessage(),
        createOrUpdateParticipation(),
      ]);

      const m = result[0];
      const userMessage: UserMessageType = {
        id: m.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "user_message",
        visibility: "visible",
        version: 0,
        user: user,
        mentions: mentions,
        content,
        context: context,
      };

      const results: ({ row: AgentMessage; m: AgentMessageType } | null)[] =
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
                return null;
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
                  agentConfigurationId: configuration.sId,
                  agentConfigurationVersion: configuration.version,
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
                  created: agentMessageRow.createdAt.getTime(),
                  sId: messageRow.sId,
                  type: "agent_message",
                  visibility: "visible",
                  version: 0,
                  parentMessageId: userMessage.sId,
                  status: "created",
                  action: null,
                  content: null,
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

      const nonNullResults = results.filter((r) => r !== null) as {
        row: AgentMessage;
        m: AgentMessageType;
      }[];

      return {
        userMessage,
        agentMessages: nonNullResults.map(({ m }) => m),
        agentMessageRows: nonNullResults.map(({ row }) => row),
      };
    });

  if (agentMessageRows.length !== agentMessages.length) {
    throw new Error("Unreachable: agentMessageRows and agentMessages mismatch");
  }
  if (agentMessages.length > 0) {
    for (const agentMessage of agentMessages) {
      void signalAgentUsage({
        userId: user?.id.toString() || context.email || context.username,
        agentConfigurationId: agentMessage.configuration.sId,
        workspaceId: owner.sId,
        messageId: agentMessage.id,
        timestamp: agentMessage.created,
      });
    }
  }
  yield {
    type: "user_message_new",
    created: Date.now(),
    messageId: userMessage.sId,
    message: userMessage,
  };

  for (let i = 0; i < agentMessages.length; i++) {
    const agentMessage = agentMessages[i];

    yield {
      type: "agent_message_new",
      created: Date.now(),
      configurationId: agentMessage.configuration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,
    };
  }

  const eventStreamGenerators = agentMessages.map((agentMessage, i) => {
    // We stitch the conversation to add the user message and only that agent message
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

    return streamRunAgentEvents(
      auth,
      eventStream,
      agentMessages[i],
      agentMessageRows[i]
    );
  });

  const eventStreamsPromises = eventStreamGenerators.map((gen) => gen.next());
  while (eventStreamsPromises.length > 0) {
    const winner = await Promise.race(
      eventStreamsPromises.map(async (p, i) => {
        return { v: await p, offset: i };
      })
    );
    if (winner.v.done) {
      eventStreamGenerators.splice(winner.offset, 1);
      eventStreamsPromises.splice(winner.offset, 1);
    } else {
      eventStreamsPromises[winner.offset] =
        eventStreamGenerators[winner.offset].next();
      yield winner.v.value;
    }
  }

  // Generate a new title if the conversation does not have one already.
  if (conversation.title === null) {
    const titleRes = await generateConversationTitle(auth, {
      ...conversation,
      content: [
        ...conversation.content,
        [userMessage],
        ...agentMessages.map((m) => [m]),
      ],
    });
    if (titleRes.isErr()) {
      logger.error(
        {
          error: titleRes.error,
        },
        "Conversation title generation error"
      );
    } else {
      const title = titleRes.value;
      await Conversation.update(
        {
          title,
        },
        {
          where: {
            id: conversation.id,
          },
        }
      );

      yield {
        type: "conversation_title",
        created: Date.now(),
        title,
      };
    }
  }
  // If the plan is monthly_active_users, update the workspace usage.
  // We don't await the result of the function call.
  if (plan.billingType === "monthly_active_users") {
    void updateWorkspacePerMonthlyActiveUsersSubscriptionUsage({
      owner,
      subscription,
    });
  }

  // Temporary: we want to monitor if we need to prevent it or not
  async function logIfUserUnknown() {
    try {
      if (!user && context.email) {
        const macthingUser = await User.findOne({
          where: {
            email: context.email,
          },
        });

        if (!macthingUser) {
          logger.warn(
            {
              conversationId: conversation.sId,
              workspaceId: owner?.sId,
            },
            "[postUserMessage] Generated a message for a user with an unknown email address."
          );
        }
      }
    } catch (e) {
      logger.error(
        {
          error: e,
        },
        "[postUserMessage] Failed to check if user is known."
      );
    }
  }
  void logIfUserUnknown();
}

/** This method creates a new user message version, and if there are new agent
 *  mentions, run them
 *  TODO: support editing with new agent mentions for any
 *  message (rather than just the last)
 */
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
): AsyncGenerator<
  | UserMessageNewEvent
  | UserMessageErrorEvent
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  const user = auth.user();
  const owner = auth.workspace();

  if (!owner || owner.id !== conversation.owner.id) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    };
    return;
  }
  if (auth.user()?.id !== message.user?.id) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "not_allowed",
        message: "Only the author of the message can edit it",
      },
    };
    return;
  }
  if (message.mentions.filter((m) => isAgentMention(m)).length > 0) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "not_allowed",
        message:
          "Editing a message that already has agent mentions is not yet supported",
      },
    };
    return;
  }

  if (
    !conversation.content[conversation.content.length - 1].some(
      (m) => m.sId === message.sId
    ) &&
    mentions.filter((m) => isAgentMention(m)).length > 0
  ) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "edition_unsupported",
        message:
          "Adding agent mentions when editing is only supported for the last message of the conversation",
      },
    };
    return;
  }

  // local error class to differentiate from other errors
  class UserMessageError extends Error {}

  let userMessage: UserMessageType | null = null;
  let agentMessages: AgentMessageType[] = [];
  let agentMessageRows: AgentMessage[] = [];
  try {
    // In one big transaction creante all Message, UserMessage, AgentMessage and Mention rows.
    const result = await front_sequelize.transaction(async (t) => {
      await getConversationRankVersionLock(conversation, t);

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
      if (!messageRow || !messageRow.userMessage) {
        throw new Error(
          "Unexpected: Message or UserMessage to edit not found in DB"
        );
      }
      const newerMessage = await Message.findOne({
        where: {
          rank: messageRow.rank,
          conversationId: conversation.id,
          version: messageRow.version + 1,
        },
      });
      if (newerMessage) {
        throw new UserMessageError(
          "Invalid user message edit request, this message was already edited."
        );
      }
      const userMessageRow = messageRow.userMessage;
      // adding messageRow as param otherwise Ts doesn't get it can't be null
      async function createMessageAndUserMessage(messageRow: Message) {
        return Message.create(
          {
            sId: generateModelSId(),
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
      }
      async function createOrUpdateParticipation() {
        if (user) {
          const participant = await ConversationParticipant.findOne({
            where: {
              conversationId: conversation.id,
              userId: user.id,
            },
            transaction: t,
          });
          if (participant) {
            return participant.update(
              {
                action: "posted",
              },
              { transaction: t }
            );
          } else {
            throw new Error(
              "Unreachable: edited message implies participation"
            );
          }
        }
      }
      const result = await Promise.all([
        createMessageAndUserMessage(messageRow),
        createOrUpdateParticipation(),
      ]);

      const m = result[0];
      const userMessage: UserMessageType = {
        id: m.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "user_message",
        visibility: m.visibility,
        version: m.version,
        user: user,
        mentions,
        content,
        context: message.context,
      };

      // For now agent messages are appended at the end of conversation
      // it is fine since for now editing with new mentions is only supported
      // for the last user message
      let nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;
      const results: ({ row: AgentMessage; m: AgentMessageType } | null)[] =
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
                return null;
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
                  agentConfigurationId: configuration.sId,
                  agentConfigurationVersion: configuration.version,
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
                  created: agentMessageRow.createdAt.getTime(),
                  sId: messageRow.sId,
                  type: "agent_message",
                  visibility: "visible",
                  version: 0,
                  parentMessageId: userMessage.sId,
                  status: "created",
                  action: null,
                  content: null,
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

      const nonNullResults = results.filter((r) => r !== null) as {
        row: AgentMessage;
        m: AgentMessageType;
      }[];
      return {
        userMessage,
        agentMessages: nonNullResults.map(({ m }) => m),
        agentMessageRows: nonNullResults.map(({ row }) => row),
      };
    });
    userMessage = result.userMessage;
    agentMessages = result.agentMessages;
    agentMessageRows = result.agentMessageRows;
    if (!userMessage) {
      throw new UserMessageError("Unreachable: userMessage is null");
    }
  } catch (e) {
    if (e instanceof UserMessageError) {
      yield {
        type: "user_message_error",
        created: Date.now(),
        error: {
          code: "edit_invalid_error",
          message: e.message,
        },
      };
      return;
    } else {
      throw e;
    }
  }

  if (agentMessageRows.length !== agentMessages.length) {
    throw new Error("Unreachable: agentMessageRows and agentMessages mismatch");
  }

  yield {
    type: "user_message_new",
    created: Date.now(),
    messageId: userMessage.sId,
    message: userMessage,
  };

  if (agentMessages.length > 0) {
    for (const agentMessage of agentMessages) {
      void signalAgentUsage({
        userId:
          user?.id.toString() ||
          message.context.email ||
          message.context.username,
        agentConfigurationId: agentMessage.configuration.sId,
        messageId: agentMessage.id,
        timestamp: agentMessage.created,
        workspaceId: owner.sId,
      });
    }
  }

  for (let i = 0; i < agentMessages.length; i++) {
    const agentMessage = agentMessages[i];

    yield {
      type: "agent_message_new",
      created: Date.now(),
      configurationId: agentMessage.configuration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,
    };
  }

  const eventStreamGenerators = agentMessages.map((agentMessage, i) => {
    if (!userMessage) {
      throw new Error("Unreachable: userMessage is null");
    }
    // We stitch the conversation to add the user message and only that agent message
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

    return streamRunAgentEvents(
      auth,
      eventStream,
      agentMessages[i],
      agentMessageRows[i]
    );
  });

  const eventStreamsPromises = eventStreamGenerators.map((gen) => gen.next());
  while (eventStreamsPromises.length > 0) {
    const winner = await Promise.race(
      eventStreamsPromises.map(async (p, i) => {
        return { v: await p, offset: i };
      })
    );
    if (winner.v.done) {
      eventStreamGenerators.splice(winner.offset, 1);
      eventStreamsPromises.splice(winner.offset, 1);
    } else {
      eventStreamsPromises[winner.offset] =
        eventStreamGenerators[winner.offset].next();
      yield winner.v.value;
    }
  }
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
  | AgentMessageErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  class AgentMessageError extends Error {}
  let agentMessageResult: {
    agentMessage: AgentMessageType;
    agentMessageRow: AgentMessage;
  } | null = null;
  try {
    agentMessageResult = await front_sequelize.transaction(async (t) => {
      await getConversationRankVersionLock(conversation, t);

      const messageRow = await Message.findOne({
        where: {
          conversationId: conversation.id,
          id: message.id,
        },
        include: [
          {
            model: AgentMessage,
            as: "agentMessage",
            required: true,
          },
        ],
        transaction: t,
      });

      if (!messageRow || !messageRow.agentMessage) {
        return null;
      }
      const newerMessage = await Message.findOne({
        where: {
          rank: messageRow.rank,
          conversationId: conversation.id,
          version: messageRow.version + 1,
        },
      });
      if (newerMessage) {
        throw new AgentMessageError(
          "Invalid agent message retry request, this message was already retried."
        );
      }
      const agentMessageRow = await AgentMessage.create(
        {
          status: "created",
          agentConfigurationId: messageRow.agentMessage.agentConfigurationId,
          agentConfigurationVersion:
            messageRow.agentMessage.agentConfigurationVersion,
        },
        { transaction: t }
      );
      const m = await Message.create(
        {
          sId: generateModelSId(),
          rank: messageRow.rank,
          conversationId: conversation.id,
          parentId: messageRow.parentId,
          version: messageRow.version + 1,
          agentMessageId: agentMessageRow.id,
        },
        {
          transaction: t,
        }
      );
      const agentMessage: AgentMessageType = {
        id: m.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "agent_message",
        visibility: m.visibility,
        version: m.version,
        parentMessageId: message.parentMessageId,
        status: "created",
        action: null,
        content: null,
        error: null,
        configuration: message.configuration,
      };
      return {
        agentMessage,
        agentMessageRow,
      };
    });
  } catch (e) {
    if (e instanceof AgentMessageError) {
      yield {
        type: "agent_message_error",
        created: Date.now(),
        configurationId: message.configuration.sId,
        error: {
          code: "retry_failed",
          message: e.message,
        },
      };
      return;
    }
    throw e;
  }

  if (!agentMessageResult) {
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: message.configuration.sId,
      messageId: message.sId,
      error: {
        code: "message_not_found",
        message: "The message to retry was not found",
      },
    };
    return;
  }

  const { agentMessage, agentMessageRow } = agentMessageResult;

  yield {
    type: "agent_message_new",
    created: Date.now(),
    configurationId: agentMessage.configuration.sId,
    messageId: agentMessage.sId,
    message: agentMessage,
  };

  // We stitch the conversation to retry the agent message correctly: no other
  // messages than this agent's past its parent message.

  // First, find the array of the parent message in conversation.content.
  const parentMessageIndex = conversation.content.findIndex((messages) => {
    return messages.some((m) => m.sId === agentMessage.parentMessageId);
  });
  if (parentMessageIndex === -1) {
    throw new Error(
      `Parent message ${agentMessage.parentMessageId} not found in conversation`
    );
  }

  // Then, find this agentmessage's array in conversation.content and add the
  // new agent message to it.
  const agentMessageArray = conversation.content.find((messages) => {
    return messages.some((m) => m.sId === message.sId && isAgentMessageType(m));
  }) as AgentMessageType[];
  agentMessageArray.push(agentMessage);

  // Finally, stitch the conversation.
  const newContent = [
    ...conversation.content.slice(0, parentMessageIndex + 1),
    [...agentMessageArray, agentMessage],
  ];

  const userMessage =
    conversation.content[parentMessageIndex][
      conversation.content[parentMessageIndex].length - 1
    ];
  if (!isUserMessageType(userMessage)) {
    throw new Error("Unreachable: parent message must be a user message");
  }

  const eventStream = runAgent(
    auth,
    agentMessage.configuration,
    {
      ...conversation,
      content: newContent,
    },
    userMessage,
    agentMessage
  );

  yield* streamRunAgentEvents(auth, eventStream, agentMessage, agentMessageRow);
}

// Injects a new content fragment in the conversation.
export async function postNewContentFragment(
  auth: Authenticator,
  {
    conversation,
    title,
    content,
    url,
    contentType,
    context,
  }: {
    conversation: ConversationType;
    title: string;
    content: string;
    url: string | null;
    contentType: ContentFragmentContentType;
    context: ContentFragmentContextType;
  }
): Promise<ContentFragmentType> {
  const owner = auth.workspace();

  if (!owner || owner.id !== conversation.owner.id) {
    throw new Error("Invalid auth for conversation.");
  }

  const { contentFragmentRow, messageRow } = await front_sequelize.transaction(
    async (t) => {
      await getConversationRankVersionLock(conversation, t);

      const contentFragmentRow = await ContentFragment.create(
        {
          content,
          title,
          url,
          contentType,
          userId: auth.user()?.id,
          userContextProfilePictureUrl: context.profilePictureUrl,
          userContextEmail: context.email,
          userContextFullName: context.fullName,
          userContextUsername: context.username,
        },
        { transaction: t }
      );
      const nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;
      const messageRow = await Message.create(
        {
          sId: generateModelSId(),
          rank: nextMessageRank,
          conversationId: conversation.id,
          contentFragmentId: contentFragmentRow.id,
        },
        {
          transaction: t,
        }
      );
      return { contentFragmentRow, messageRow };
    }
  );

  const contentFragment = renderContentFragment({
    message: messageRow,
    contentFragment: contentFragmentRow,
  });

  return contentFragment;
}

async function* streamRunAgentEvents(
  auth: Authenticator,
  eventStream: AsyncGenerator<
    | AgentErrorEvent
    | AgentActionEvent
    | AgentActionSuccessEvent
    | GenerationTokensEvent
    | AgentGenerationSuccessEvent
    | AgentGenerationCancelledEvent
    | AgentMessageSuccessEvent,
    void
  >,
  agentMessage: AgentMessageType,
  agentMessageRow: AgentMessage
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  let content = "";
  for await (const event of eventStream) {
    switch (event.type) {
      case "agent_error":
        // Store error in database.
        await agentMessageRow.update({
          status: "failed",
          errorCode: event.error.code,
          errorMessage: event.error.message,
        });

        logger.error(
          {
            error: event.error,
            workspaceId: auth.workspace()?.sId,
            agentMessageId: agentMessage.sId,
          },
          "Agent error"
        );

        yield event;
        return;

      case "agent_action_success":
        // Store action in database.
        if (event.action.type === "retrieval_action") {
          await agentMessageRow.update({
            agentRetrievalActionId: event.action.id,
          });
        } else if (event.action.type === "dust_app_run_action") {
          await agentMessageRow.update({
            agentDustAppRunActionId: event.action.id,
          });
        } else if (event.action.type === "database_query_action") {
          await agentMessageRow.update({
            agentDatabaseQueryActionId: event.action.id,
          });
        } else {
          ((action: never) => {
            throw new Error(
              "Unknown `type` for `agent_action_success` event",
              action
            );
          })(event.action);
        }
        yield event;
        break;

      case "agent_generation_success":
        // Store message in database.
        await agentMessageRow.update({
          content: event.text,
        });
        yield event;
        break;

      case "agent_message_success":
        // Update status in database.
        await agentMessageRow.update({
          status: "succeeded",
        });
        yield event;
        break;

      case "agent_generation_cancelled":
        if (agentMessageRow.status !== "cancelled") {
          await agentMessageRow.update({
            status: "cancelled",
            content: content,
          });
          yield event;
        }
        break;

      // All other events that won't impact the database and are related to actions or tokens
      // generation.
      case "retrieval_params":
      case "dust_app_run_params":
      case "dust_app_run_block":
      case "database_query_params":
      case "database_query_output":
        yield event;
        break;
      case "generation_tokens":
        content += event.text;
        yield event;
        break;

      default:
        ((event: never) => {
          logger.error("Unknown `streamRunAgentEvents` event type", event);
        })(event);
        return;
    }
  }
}

async function isMessagesLimitReached({
  owner,
  plan,
}: {
  owner: WorkspaceType;
  plan: PlanType;
}): Promise<boolean> {
  if (plan.limits.assistant.maxMessages === -1) {
    return false;
  }
  const messages = await Message.findAll({
    attributes: ["id"],
    include: [
      {
        model: Conversation,
        as: "conversation",
        attributes: ["id", "workspaceId"],
        required: true,
        where: { workspaceId: owner.id },
      },
    ],
    where: { agentMessageId: { [Op.ne]: null } },
    limit: plan.limits.assistant.maxMessages,
  });

  return messages.length === plan.limits.assistant.maxMessages;
}
