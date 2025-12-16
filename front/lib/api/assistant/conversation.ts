import assert from "assert";
import type { Transaction } from "sequelize";
import { col } from "sequelize";

import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import {
  createAgentMessages,
  createUserMentions,
  createUserMessage,
  updateConversationRequirements,
} from "@app/lib/api/assistant/conversation/mentions";
import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import {
  makeAgentMentionsRateLimitKeyForWorkspace,
  makeMessageRateLimitKeyForWorkspace,
  makeProgrammaticUsageRateLimitKeyForWorkspace,
} from "@app/lib/api/assistant/rate_limits";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { maybeUpsertFileAttachment } from "@app/lib/api/files/attachments";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage_tracking";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { USER_MENTION_REGEX } from "@app/lib/mentions/format";
import {
  AgentMessageModel,
  ConversationModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { triggerConversationUnreadNotifications } from "@app/lib/notifications/workflows/conversation-unread";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize, statsDClient } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { ServerSideTracking } from "@app/lib/tracking/server";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger, { auditLog } from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  AgenticMessageData,
  AgentMessageType,
  APIErrorWithStatusCode,
  ContentFragmentContextType,
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
  ContentFragmentType,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  MentionType,
  ModelId,
  Result,
  UserMessageContext,
  UserMessageOrigin,
  UserMessageType,
} from "@app/types";
import {
  assertNever,
  ConversationError,
  Err,
  isAgentMention,
  isContentFragmentInputWithContentNode,
  isContentFragmentType,
  isProviderWhitelisted,
  isUserMessageType,
  md5,
  Ok,
  removeNulls,
} from "@app/types";
import { isAgentMessageType } from "@app/types/assistant/conversation";

const ALLOWED_API_KEY_ORIGINS: UserMessageOrigin[] = [
  "api",
  "excel",
  "github-copilot-chat", // TODO: find out how it's used
  "gsheet",
  "make",
  "n8n",
  "powerpoint",
  "zapier",
  "zendesk",
  "slack", // TODO: should not be allowed for API key usage
  "web", // TODO: should not be allowed for API key usage
];

const ALLOWED_OAUTH_ORIGINS: UserMessageOrigin[] = [
  "api",
  "cli",
  "cli_programmatic",
  "extension",
  "github-copilot-chat", // TODO: find out how it's used
  "raycast",
  "teams",
  "web", // TODO: should not be allowed for OAuth usage
];

/**
 * Conversation Creation, update and deletion
 */

export async function createConversation(
  auth: Authenticator,
  {
    title,
    visibility,
    depth = 0,
    triggerId,
    spaceId,
  }: {
    title: string | null;
    visibility: ConversationVisibility;
    depth?: number;
    triggerId?: ModelId | null;
    spaceId: ModelId | null;
  }
): Promise<ConversationType> {
  const owner = auth.getNonNullableWorkspace();
  let space: SpaceResource | null = null;

  if (spaceId) {
    const spaces = await SpaceResource.fetchByModelIds(auth, [spaceId]);

    // Check if the space exists.
    if (spaces.length < 1) {
      throw new Error("Cannot create conversation in a non-existent space.");
    }
    space = spaces[0];
  }

  const conversation = await ConversationResource.makeNew(
    auth,
    {
      sId: generateRandomModelSId(),
      title,
      visibility,
      depth,
      triggerId,
      spaceId,
      requestedSpaceIds: [],
    },
    space
  );

  return {
    id: conversation.id,
    owner,
    created: conversation.createdAt.getTime(),
    updated: conversation.updatedAt.getTime(),
    sId: conversation.sId,
    title: conversation.title,
    depth: conversation.depth,
    content: [],
    unread: false,
    actionRequired: false,
    hasError: false,
    visibility: conversation.visibility,
    requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
    spaceId: space?.sId ?? null,
  };
}

export async function updateConversationTitle(
  auth: Authenticator,
  {
    conversationId,
    title,
  }: {
    conversationId: string;
    title: string;
  }
): Promise<Result<undefined, ConversationError>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  await conversation.updateTitle(title);

  return new Ok(undefined);
}

/**
 * Delete-or-Leave:
 * - If the user is the last participant: perform a soft-delete
 * - Otherwise just remove the user from the participants
 */
export async function deleteOrLeaveConversation(
  auth: Authenticator,
  {
    conversationId,
  }: {
    conversationId: string;
  }
): Promise<Result<{ success: true }, Error>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    {
      includeDeleted: true,
    }
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  const user = auth.user();
  if (!user) {
    return new Err(new Error("User not authenticated."));
  }
  const leaveRes = await conversation.leaveConversation(auth);
  if (leaveRes.isErr()) {
    return new Err(leaveRes.error);
  }

  // If the user was the last member, soft-delete the conversation.
  if (leaveRes.value.affectedCount === 0 && leaveRes.value.wasLastMember) {
    await conversation.updateVisibilityToDeleted();
  }
  return new Ok({ success: true });
}

export async function getConversationMessageType(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  messageId: string
): Promise<"user_message" | "agent_message" | "content_fragment" | null> {
  if (!auth.workspace()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await MessageModel.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId: auth.getNonNullableWorkspace().id,
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

export async function getMessageConversationId(
  auth: Authenticator,
  { messageId }: { messageId: number }
): Promise<{ conversationId: string | null; messageId: string | null }> {
  const messageRow = await MessageModel.findOne({
    attributes: ["sId"],
    where: {
      agentMessageId: messageId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    include: [
      {
        model: ConversationModel,
        as: "conversation",
        attributes: ["sId"],
      },
    ],
  });

  return {
    conversationId: messageRow?.conversation?.sId ?? null,
    messageId: messageRow?.sId ?? null,
  };
}

export async function getLastUserMessage(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const message = await MessageModel.findOne({
    where: {
      workspaceId: owner.id,
      conversationId: conversation.id,
    },
    order: [
      ["rank", "DESC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: false,
      },
    ],
  });

  const content = message?.userMessage?.content;
  if (!content) {
    return new Err(
      new Error("Error suggesting agents: no content found in conversation.")
    );
  }
  return new Ok(content);
}

/**
 * Get the mentions from the last user message in a conversation
 */
export async function getLastUserMessageMentions(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<string[], Error>> {
  const owner = auth.getNonNullableWorkspace();

  const message = await MessageModel.findOne({
    where: {
      workspaceId: owner.id,
      conversationId: conversation.id,
    },
    order: [
      ["rank", "DESC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
      },
      {
        model: MentionModel,
        as: "mentions",
        required: false,
        include: [
          {
            model: UserModel,
            as: "user",
            required: false,
            attributes: ["sId"],
          },
        ],
      },
    ],
  });

  if (!message) {
    return new Ok([]);
  }

  const mentions: string[] = removeNulls(
    (message as any).mentions.map(
      (mention: MentionModel) =>
        mention.agentConfigurationId ?? mention.user?.sId
    )
  );
  return new Ok(mentions);
}

/**
 * Conversation API
 */

/**
 * To avoid deadlocks when using Postgresql advisory locks, please make sure to not issue any other
 * SQL query outside of the transaction `t` that is holding the lock.
 * Otherwise, the other query will be competing for a connection in the database connection pool,
 * resulting in a potential deadlock when the pool is fully occupied.
 */
async function getConversationRankVersionLock(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  t: Transaction
) {
  const now = new Date();
  // Get a lock using the unique lock key (number withing postgresql BigInt range).
  const hash = md5(`conversation_message_rank_version_${conversation.id}`);
  const lockKey = parseInt(hash, 16) % 9999999999;
  // OK because we need to setup a lock
  // eslint-disable-next-line dust/no-raw-sql
  await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
    transaction: t,
    replacements: { key: lockKey },
  });

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      duration: new Date().getTime() - now.getTime(),
      lockKey,
    },
    "[ASSISTANT_TRACE] Advisory lock acquired"
  );
}

export function getRelatedContentFragments(
  conversation: ConversationType,
  message: UserMessageType
): ContentFragmentType[] {
  const potentialContentFragments = conversation.content
    // Only the latest version of each message.
    .map((versions) => versions[versions.length - 1])
    // Only the content fragments.
    .filter(isContentFragmentType)
    // That are preceding the message by rank in the conversation.
    .filter((m) => m.rank < message.rank)
    // Sort by rank descending.
    .toSorted((a, b) => b.rank - a.rank);

  const relatedContentFragments: ContentFragmentType[] = [];
  let lastRank = message.rank;

  // Add until we reach a gap in ranks.
  for (const contentFragment of potentialContentFragments) {
    if (contentFragment.rank === lastRank - 1) {
      relatedContentFragments.push(contentFragment);
      lastRank = contentFragment.rank;
    } else {
      break;
    }
  }

  return relatedContentFragments;
}

export function validateUserMessageContext(
  auth: Authenticator,
  context: UserMessageContext
): Result<void, APIErrorWithStatusCode> {
  const authMethod = auth.authMethod();
  switch (authMethod) {
    case "api_key":
      if (!ALLOWED_API_KEY_ORIGINS.includes(context.origin)) {
        return new Err({
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "This origin is not allowed when using a custom API key. See documentation to fix to an allowed origin.",
          },
        });
      }
      break;
    case "oauth":
      if (!ALLOWED_OAUTH_ORIGINS.includes(context.origin)) {
        return new Err({
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "This origin is not allowed when using OAuth for authentication. See documentation to fix to an allowed origin.",
          },
        });
      }
      break;
    case "session":
    case "internal":
    case "system_api_key":
      break;
    default:
      assertNever(authMethod);
  }

  return new Ok(undefined);
}

// This method is in charge of creating a new user message in database, running the necessary agents
// in response and updating accordingly the conversation. AgentMentions must point to valid agent
// configurations from the same workspace or whose scope is global.
export async function postUserMessage(
  auth: Authenticator,
  {
    conversation,
    content,
    mentions,
    context,
    agenticMessageData,
    skipToolsValidation,
  }: {
    conversation: ConversationType;
    content: string;
    mentions: MentionType[];
    context: UserMessageContext;
    agenticMessageData?: AgenticMessageData;
    skipToolsValidation: boolean;
  }
): Promise<
  Result<
    {
      userMessage: UserMessageType;
      agentMessages: AgentMessageType[];
    },
    APIErrorWithStatusCode
  >
> {
  const validateUserMessageContextRes = validateUserMessageContext(
    auth,
    context
  );
  if (validateUserMessageContextRes.isErr()) {
    return validateUserMessageContextRes;
  }

  const user = auth.user();
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const plan = subscription?.plan;

  if (!owner || owner.id !== conversation.owner.id || !subscription || !plan) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    });
  }

  // Check plan and rate limit.
  const messageLimit = await isMessagesLimitReached(auth, {
    mentions,
    context,
  });
  if (messageLimit.isLimitReached && messageLimit.limitType) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "plan_message_limit_exceeded",
        message:
          messageLimit.limitType === "plan_message_limit_exceeded"
            ? "The message limit for this plan has been exceeded."
            : "The rate limit for this workspace has been exceeded.",
      },
    });
  }

  // `getAgentConfiguration` checks that we're only pulling a configuration from the
  // same workspace or a global one.
  const results = await Promise.all([
    getAgentConfigurations(auth, {
      agentIds: mentions
        .filter(isAgentMention)
        .map((mention) => mention.configurationId),
      variant: "light",
    }),
    (() => {
      // If the origin of the user message is "run_agent", we do not want to update the
      // participation of the user so that the conversation does not appear in the user's history.
      if (agenticMessageData?.type === "run_agent") {
        return;
      }

      return ConversationResource.upsertParticipation(auth, {
        conversation,
        action: "posted",
        user: user?.toJSON() ?? null,
      });
    })(),
  ]);

  const agentConfigurations = removeNulls(results[0]);

  for (const agentConfig of agentConfigurations) {
    if (!canAccessAgent(agentConfig)) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "This agent is either disabled or you don't have access to it.",
        },
      });
    }

    if (!isProviderWhitelisted(owner, agentConfig.model.providerId)) {
      // Stop processing if any agent uses a disabled provider.
      return new Err({
        status_code: 400,
        api_error: {
          type: "model_disabled",
          message:
            `Assistant ${agentConfig.name} is based on a model that was disabled ` +
            `by your workspace admin. Please edit the agent to use another model ` +
            `(advanced settings in the Instructions panel).`,
        },
      });
    }

    const featureFlags = await getFeatureFlags(owner);
    const supportedModelConfig = getSupportedModelConfig(agentConfig.model);
    if (
      supportedModelConfig.featureFlag &&
      !featureFlags.includes(supportedModelConfig.featureFlag)
    ) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The model is not supported.",
        },
      });
    }
  }

  // In one big transaction create all Message, UserMessage, AgentMessage and Mention rows.
  const { userMessage, agentMessages } = await withTransaction(async (t) => {
    // Since we are getting a transaction level lock, we can't execute any other SQL query outside of
    // this transaction, otherwise this other query will be competing for a connection in the database
    // connection pool, resulting in a deadlock.
    await getConversationRankVersionLock(auth, conversation, t);

    // We clear the hasError flag of a conversation when posting a new user message.
    if (conversation.hasError) {
      await ConversationResource.clearHasError(
        auth,
        {
          conversation,
        },
        t
      );
    }

    let nextMessageRank =
      ((await MessageModel.max<number | null, MessageModel>("rank", {
        where: {
          conversationId: conversation.id,
        },
        transaction: t,
      })) ?? -1) + 1;

    const userMessage = await createUserMessage(auth, {
      conversation,
      content,
      mentions,
      metadata: {
        type: "create",
        user: user?.toJSON() ?? null,
        rank: nextMessageRank++,
        context,
        agenticMessageData,
      },
      transaction: t,
    });

    await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
      transaction: t,
    });

    // Mark the conversation as unread for all participants except the user.
    await ConversationResource.markAsUnreadForOtherParticipants(auth, {
      conversation,
      excludedUser: user?.toJSON(),
    });

    const featureFlags = await getFeatureFlags(owner);
    if (featureFlags.includes("notifications")) {
      // TODO(mentionsv2) here we fetch the conversation again to trigger the notification.
      // We should refactor to pass the resource as the argument of the postUserMessage function.
      const conversationRes = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      if (conversationRes) {
        await triggerConversationUnreadNotifications(auth, {
          conversation: conversationRes,
          messageId: userMessage.sId,
        });
      }
    }

    const agentMessages = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions,
        agentConfigurations,
        skipToolsValidation,
        nextMessageRank,
        userMessage,
      },
      transaction: t,
    });

    await ConversationResource.markAsUpdated(auth, { conversation, t });

    return {
      userMessage,
      agentMessages,
    };
  });

  void ServerSideTracking.trackUserMessage({
    userMessage,
    workspace: conversation.owner,
    userId: user ? `user-${user.id}` : `api-${context.username}`,
    conversationId: conversation.sId,
    agentMessages,
  });

  await Promise.all([
    publishMessageEventsOnMessagePostOrEdit(
      conversation,
      {
        ...userMessage,
        contentFragments: getRelatedContentFragments(conversation, userMessage),
      },
      agentMessages
    ),
    // If the conversation did not have any agent messages yet, we might not have a title, this ensure we generate one.
    // Doing after 3 messages to avoid generating a title too early.
    userMessage.rank >= 3
      ? ensureConversationTitle(auth, {
          conversation,
          userMessage,
        })
      : Promise.resolve(undefined),
  ]);

  return new Ok({
    userMessage,
    agentMessages,
  });
}

/**
 * Can a user mention a given configuration
 */
function canAccessAgent(
  agentConfiguration: LightAgentConfigurationType
): boolean {
  switch (agentConfiguration.status) {
    case "active":
    case "draft":
      return agentConfiguration.canRead;
    case "disabled_free_workspace":
    case "disabled_missing_datasource":
    case "disabled_by_admin":
    case "archived":
      return false;
    default:
      assertNever(agentConfiguration.status);
  }
}

class UserMessageError extends Error {}

/**
 * This method creates a new user message version. If a new message contains agent mentions, it will create new agent messages,
 * only when there are no agent messages after the edited user message.
 */
export async function editUserMessage(
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
    { userMessage: UserMessageType; agentMessages: AgentMessageType[] },
    APIErrorWithStatusCode
  >
> {
  const user = auth.user();
  const owner = auth.workspace();

  if (!owner || owner.id !== conversation.owner.id) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    });
  }

  if (auth.user()?.id !== message.user?.id) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only the author of the message can edit it",
      },
    });
  }

  let userMessage: UserMessageType | null = null;
  let agentMessages: AgentMessageType[] = [];

  const results = await Promise.all([
    Promise.all(
      mentions.filter(isAgentMention).map((mention) =>
        getAgentConfiguration(auth, {
          agentId: mention.configurationId,
          variant: "light",
        })
      )
    ),
    ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: user?.toJSON() ?? null,
    }),
  ]);

  const agentConfigurations = removeNulls(results[0]);

  for (const agentConfig of agentConfigurations) {
    if (!canAccessAgent(agentConfig)) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "This agent is either disabled or you don't have access to it.",
        },
      });
    }

    if (!isProviderWhitelisted(owner, agentConfig.model.providerId)) {
      // Stop processing if any agent uses a disabled provider.
      return new Err({
        status_code: 400,
        api_error: {
          type: "model_disabled",
          message:
            `Assistant ${agentConfig.name} is based on a model that was disabled ` +
            `by your workspace admin. Please edit the agent to use another model ` +
            `(advanced settings in the Instructions panel).`,
        },
      });
    }
  }

  try {
    // In one big transaction create all Message, UserMessage, AgentMessage, and Mention rows.
    const result = await withTransaction(async (t) => {
      // Since we are getting a transaction level lock, we can't execute any other SQL query outside of
      // this transaction, otherwise this other query will be competing for a connection in the database
      // connection pool, resulting in a deadlock.
      await getConversationRankVersionLock(auth, conversation, t);

      const messageRow = await MessageModel.findOne({
        where: {
          sId: message.sId,
          conversationId: conversation.id,
          workspaceId: owner.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: true,
          },
        ],
        transaction: t,
      });

      if (!messageRow || !messageRow.userMessage) {
        throw new Error(
          "Unexpected: Message or UserMessage to edit not found in DB"
        );
      }

      const newerMessage = await MessageModel.findOne({
        where: {
          workspaceId: owner.id,
          rank: messageRow.rank,
          conversationId: conversation.id,
          version: messageRow.version + 1,
        },
        transaction: t,
      });

      if (newerMessage) {
        throw new UserMessageError(
          "Invalid user message edit request, this message was already edited."
        );
      }

      const userMessage = await createUserMessage(auth, {
        conversation,
        content,
        mentions,
        metadata: {
          type: "edit",
          message,
        },
        transaction: t,
      });

      // Mark the conversation as unread for all participants except the user.
      await ConversationResource.markAsUnreadForOtherParticipants(auth, {
        conversation,
        excludedUser: user?.toJSON(),
      });

      await createUserMentions(auth, {
        mentions,
        message: userMessage,
        conversation,
        transaction: t,
      });

      const hasAgentMentions = mentions.some(isAgentMention);

      if (hasAgentMentions) {
        // Check if there are any agent messages after the edited user message
        // by checking conversation.content (which is indexed by rank)
        const hasAgentMessagesAfter = conversation.content
          .slice(messageRow.rank + 1)
          .some((versions) => {
            if (versions.length === 0) {
              return false;
            }
            const latestVersion = versions[versions.length - 1];
            return isAgentMessageType(latestVersion);
          });

        let agentMessages: AgentMessageType[] = [];

        // Only create agent messages if there are no agent messages after the edited user message
        if (!hasAgentMessagesAfter) {
          const nextMessageRank =
            ((await MessageModel.max<number | null, MessageModel>("rank", {
              where: {
                conversationId: conversation.id,
              },
              transaction: t,
            })) ?? -1) + 1;

          agentMessages = await createAgentMessages(auth, {
            conversation,
            metadata: {
              type: "create",
              mentions,
              agentConfigurations,
              skipToolsValidation,
              nextMessageRank,
              userMessage,
            },
            transaction: t,
          });
        }

        await ConversationResource.markAsUpdated(auth, { conversation, t });

        return {
          userMessage,
          agentMessages,
        };
      }

      return {
        userMessage,
        agentMessages,
      };
    });

    userMessage = result.userMessage;
    agentMessages = result.agentMessages;

    if (!userMessage) {
      throw new UserMessageError("Unreachable: userMessage is null");
    }
  } catch (e) {
    if (e instanceof UserMessageError) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: e.message,
        },
      });
    } else {
      throw e;
    }
  }

  // TODO(DURABLE-AGENTS 2025-07-17): Publish message events to all open tabs to maintain
  // conversation state synchronization in multiplex mode. This is a temporary solution -
  // we should move this to a dedicated real-time sync mechanism.
  await publishMessageEventsOnMessagePostOrEdit(
    conversation,
    {
      ...userMessage,
      contentFragments: getRelatedContentFragments(conversation, userMessage),
    },
    agentMessages
  );

  return new Ok({
    userMessage,
    agentMessages,
  });
}

class AgentMessageError extends Error {}

export async function handleAgentMessage(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: AgentMessageType;
  }
) {
  if (!agentMessage.content) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Agent message content is required",
      },
    });
  }
  const userMentions = [
    ...agentMessage.content.matchAll(USER_MENTION_REGEX),
  ].map((match) => ({ name: match[1], sId: match[2] }));

  if (userMentions.length > 0) {
    await withTransaction(async (t) => {
      for (const m of userMentions) {
        await createUserMentions(auth, {
          mentions: [{ type: "user", userId: m.sId }],
          message: agentMessage,
          conversation,
          transaction: t,
        });
      }
    });
  }
}

// This method is in charge of re-running an agent interaction (generating a new
// AgentMessage as a result)
export async function retryAgentMessage(
  auth: Authenticator,
  {
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AgentMessageType;
  }
): Promise<Result<AgentMessageType, APIErrorWithStatusCode>> {
  let agentMessageResult: {
    agentMessage: AgentMessageType;
  } | null = null;
  try {
    agentMessageResult = await withTransaction(async (t) => {
      await getConversationRankVersionLock(auth, conversation, t);

      // We clear the hasError flag of a conversation when retrying an agent message.
      if (conversation.hasError) {
        await ConversationResource.clearHasError(
          auth,
          {
            conversation,
          },
          t
        );
      }

      const messageRow = await MessageModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          id: message.id,
        },
        include: [
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: true,
          },
        ],
        transaction: t,
      });

      if (!messageRow || !messageRow.agentMessage || !messageRow.parentId) {
        return null;
      }
      const newerMessage = await MessageModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          rank: messageRow.rank,
          conversationId: conversation.id,
          version: messageRow.version + 1,
        },
        transaction: t,
      });
      if (newerMessage) {
        throw new AgentMessageError(
          "Invalid agent message retry request, this message was already retried."
        );
      }

      const agentMessages = await createAgentMessages(auth, {
        conversation,
        metadata: {
          type: "retry",
          parentId: messageRow.parentId,
          agentMessage: message,
        },
        transaction: t,
      });

      if (agentMessages.length !== 1) {
        throw new AgentMessageError(
          `Unexpected: expected 1 agent message result while retrying agent message, got ${agentMessages.length} instead.`
        );
      }

      await ConversationResource.markAsUpdated(auth, { conversation, t });

      return {
        agentMessage: agentMessages[0],
      };
    });
  } catch (e) {
    if (e instanceof AgentMessageError) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: e.message,
        },
      });
    }

    throw e;
  }

  if (!agentMessageResult) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "The message to retry was not found",
      },
    });
  }

  const { agentMessage } = agentMessageResult;

  // First, find the array of the parent message in conversation.content.
  const parentMessageIndex = conversation.content.findIndex((messages) => {
    return messages.some((m) => m.sId === agentMessage.parentMessageId);
  });
  if (parentMessageIndex === -1) {
    throw new Error(
      `Parent message ${agentMessage.parentMessageId} not found in conversation`
    );
  }

  const userMessage =
    conversation.content[parentMessageIndex][
      conversation.content[parentMessageIndex].length - 1
    ];
  if (!isUserMessageType(userMessage)) {
    throw new Error("Unreachable: parent message must be a user message");
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentMessage.configuration.sId,
    variant: "light",
  });

  assert(
    agentConfiguration,
    "Unreachable: could not find detailed configuration for agent"
  );

  void launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
      userMessageOrigin: userMessage.context.origin,
    },
    startStep: 0,
  });

  // TODO(DURABLE-AGENTS 2025-07-17): Publish message events to all open tabs to maintain
  // conversation state synchronization in multiplex mode. This is a temporary solution -
  // we should move this to a dedicated real-time sync mechanism.
  await publishAgentMessagesEvents(conversation, [agentMessage]);

  return new Ok(agentMessage);
}

// Injects a new content fragment in the conversation.
export async function postNewContentFragment(
  auth: Authenticator,
  conversation: ConversationType,
  cf: ContentFragmentInputWithFileIdType | ContentFragmentInputWithContentNode,
  context: ContentFragmentContextType | null
): Promise<Result<ContentFragmentType, Error>> {
  const owner = auth.workspace();
  if (!owner || owner.id !== conversation.owner.id) {
    throw new Error("Invalid auth for conversation.");
  }

  const upsertAttachmentRes = await maybeUpsertFileAttachment(auth, {
    contentFragments: [cf],
    conversation,
  });

  if (upsertAttachmentRes.isErr()) {
    return upsertAttachmentRes;
  }

  const messageId = generateRandomModelSId();

  const cfBlobRes = await getContentFragmentBlob(auth, cf);
  if (cfBlobRes.isErr()) {
    return cfBlobRes;
  }

  const supersededContentFragmentId = cf.supersededContentFragmentId;
  // If the request is superseding an existing content fragment, we need to validate that it exists
  // and is part of the conversation.
  if (supersededContentFragmentId) {
    const found = conversation.content.some((versions) => {
      const latest = versions[versions.length - 1];
      return (
        isContentFragmentType(latest) &&
        latest.contentFragmentId === supersededContentFragmentId
      );
    });

    if (!found) {
      return new Err(new Error("Superseded content fragment not found."));
    }
  }

  const { contentFragment, messageRow } = await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    const fullBlob = {
      ...cfBlobRes.value,
      userId: auth.user()?.id,
      userContextProfilePictureUrl: context?.profilePictureUrl,
      userContextEmail: context?.email,
      userContextFullName: context?.fullName,
      userContextUsername: context?.username,
      workspaceId: owner.id,
    };

    const contentFragment = await (() => {
      if (supersededContentFragmentId) {
        return ContentFragmentResource.makeNewVersion(
          supersededContentFragmentId,
          fullBlob,
          t
        );
      } else {
        return ContentFragmentResource.makeNew(fullBlob, t);
      }
    })();

    const nextMessageRank =
      ((await MessageModel.max<number | null, MessageModel>("rank", {
        where: {
          conversationId: conversation.id,
        },
        transaction: t,
      })) ?? -1) + 1;
    const messageRow = await MessageModel.create(
      {
        sId: messageId,
        rank: nextMessageRank,
        conversationId: conversation.id,
        contentFragmentId: contentFragment.id,
        workspaceId: owner.id,
      },
      {
        transaction: t,
      }
    );

    if (isContentFragmentInputWithContentNode(cf)) {
      await updateConversationRequirements(auth, {
        contentFragment: cf,
        conversation,
        t,
      });
    }

    await ConversationResource.markAsUpdated(auth, { conversation, t });

    return { contentFragment, messageRow };
  });
  const render = await contentFragment.renderFromMessage({
    auth,
    conversationId: conversation.sId,
    message: messageRow,
  });

  return new Ok(render);
}

export async function softDeleteUserMessage(
  auth: Authenticator,
  {
    message,
    conversation,
  }: {
    message: UserMessageType;
    conversation: ConversationType;
  }
): Promise<Result<{ success: true }, ConversationError>> {
  if (message.visibility === "deleted") {
    return new Ok({ success: true });
  }

  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  // Only admins or the user who sent the message can delete it.
  if (!auth.isAdmin() && message.user?.id !== user.id) {
    return new Err(new ConversationError("message_deletion_not_authorized"));
  }

  const userMessage = await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    const relatedContentFragments = await getRelatedContentFragments(
      conversation,
      message
    );

    const userMessage = await createUserMessage(auth, {
      conversation,
      content: "deleted",
      mentions: [],
      metadata: {
        type: "delete",
        message,
      },
      transaction: t,
    });

    if (relatedContentFragments.length > 0) {
      await MessageModel.update(
        {
          visibility: "deleted",
          contentFragmentId: col("contentFragmentId"),
        },
        {
          where: {
            workspaceId: owner.id,
            conversationId: conversation.id,
            id: relatedContentFragments.map((cf) => cf.id),
          },
          transaction: t,
        }
      );
    }

    await ConversationResource.markAsUpdated(auth, { conversation, t });

    return userMessage;
  });

  await publishMessageEventsOnMessagePostOrEdit(
    conversation,
    { ...userMessage, contentFragments: [] },
    []
  );

  auditLog(
    {
      author: user.toJSON(),
      workspaceId: owner.sId,
      conversationId: conversation.sId,
      messageId: message.sId,
    },
    auth.isAdmin()
      ? "Admin deleted a user message"
      : "User deleted their message"
  );

  return new Ok({ success: true });
}

export async function softDeleteAgentMessage(
  auth: Authenticator,
  {
    message,
    conversation,
  }: {
    message: AgentMessageType;
    conversation: ConversationWithoutContentType;
  }
): Promise<Result<{ success: true }, ConversationError>> {
  if (message.visibility === "deleted") {
    return new Ok({ success: true });
  }

  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  const parentMessage = await MessageModel.findOne({
    where: {
      sId: message.parentMessageId,
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
      },
    ],
  });

  if (!parentMessage || !parentMessage.userMessage) {
    return new Err(new ConversationError("message_not_found"));
  }

  if (parentMessage.userMessage.userId !== user.id) {
    return new Err(new ConversationError("message_deletion_not_authorized"));
  }

  const agentMessages = await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    return createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "delete",
        agentMessage: message,
        parentId: parentMessage.id,
      },
      transaction: t,
    });
  });

  await publishAgentMessagesEvents(conversation, agentMessages);

  auditLog(
    {
      author: user.toJSON(),
      workspaceId: owner.sId,
      conversationId: conversation.sId,
      messageId: message.sId,
    },
    "User deleted an agent message"
  );

  return new Ok({ success: true });
}

export interface MessageLimit {
  isLimitReached: boolean;
  limitType: "rate_limit_error" | "plan_message_limit_exceeded" | null;
}

async function isMessagesLimitReached(
  auth: Authenticator,
  {
    mentions,
    context,
  }: {
    mentions: MentionType[];
    context: UserMessageContext;
  }
): Promise<MessageLimit> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  // For programmatic usage, apply credit-based rate limiting.
  // This prevents close-to-0 credit attacks where many messages are sent simultaneously
  // before token usage is computed. Rate limit is based on total credit amount in dollars.
  if (isProgrammaticUsage(auth, { userMessageOrigin: context.origin })) {
    const activeCredits = await CreditResource.listActive(auth);

    // Calculate total remaining credits in dollars (micro USD / 1,000,000).
    const totalRemainingCreditsDollars =
      activeCredits.reduce(
        (sum, c) => sum + (c.initialAmountMicroUsd - c.consumedAmountMicroUsd),
        0
      ) / 1_000_000;

    // Rate limit: creditDollarAmount messages per minute.
    // Minimum of 1 to allow at least some messages even with very low credits.
    const maxMessagesPerMinute = Math.max(
      1,
      Math.floor(totalRemainingCreditsDollars)
    );

    const remainingMessages = await rateLimiter({
      key: makeProgrammaticUsageRateLimitKeyForWorkspace(owner),
      maxPerTimeframe: maxMessagesPerMinute,
      timeframeSeconds: 60,
      logger,
    });

    if (remainingMessages <= 0) {
      logger.info(
        {
          workspaceId: owner.sId,
          totalRemainingCreditsDollars,
        },
        "Pre-emptive rate limit triggered for programmatic usage."
      );

      statsDClient.increment(
        "assistant.rate_limiter.programmatic_usage.credit_based_limit_triggered",
        1,
        { workspace_id: owner.sId }
      );

      return {
        isLimitReached: true,
        limitType: "rate_limit_error",
      };
    }

    return {
      isLimitReached: false,
      limitType: null,
    };
  }

  // Checking rate limit
  const activeSeats = await countActiveSeatsInWorkspaceCached(owner.sId);

  const userMessagesLimit = 10 * activeSeats;
  const remainingMessages = await rateLimiter({
    key: makeMessageRateLimitKeyForWorkspace(owner),
    maxPerTimeframe: userMessagesLimit,
    timeframeSeconds: 60,
    logger,
  });

  if (remainingMessages <= 0) {
    return {
      isLimitReached: true,
      limitType: "rate_limit_error",
    };
  }

  // Checking plan limit
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  if (plan.limits.assistant.maxMessages === -1) {
    return {
      isLimitReached: false,
      limitType: null,
    };
  }

  // If no mentions, check general message limit against the plan
  if (mentions.length === 0) {
    // Block messages if maxMessages is 0 (no plan or very restrictive plan)
    if (maxMessages === 0) {
      return {
        isLimitReached: true,
        limitType: "plan_message_limit_exceeded",
      };
    }
    // Otherwise allow non-mention messages for users with a valid plan
    return {
      isLimitReached: false,
      limitType: null,
    };
  }

  // Accounting for each mention separately.
  // The return value won't account for the parallel calls depending on network timing
  // but we are fine with a little bit of overusage.
  const remainingMentions = await Promise.all(
    mentions.map(() =>
      rateLimiter({
        key: makeAgentMentionsRateLimitKeyForWorkspace(
          owner,
          maxMessagesTimeframe
        ),
        maxPerTimeframe: maxMessages * activeSeats,
        timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
        logger,
      })
    )
  );
  // We let the user talk to all agents if any of the rate limiter answered "ok".
  // Subsequent calls to this function would block the user anyway.
  const isLimitReached = remainingMentions.filter((r) => r > 0).length === 0;
  return {
    isLimitReached,
    limitType: isLimitReached ? "plan_message_limit_exceeded" : null,
  };
}
