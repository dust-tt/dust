import assert from "assert";
import type { NextApiRequest } from "next";
import type { Transaction } from "sequelize";
import { col } from "sequelize";

import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import { getRelatedContentFragments } from "@app/lib/api/assistant/content_fragments";
import { runAgentLoopWorkflow } from "@app/lib/api/assistant/conversation/agent_loop";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import {
  canAgentBeUsedInProjectConversation,
  createAgentMessages,
  createUserMentions,
  createUserMessage,
  updateConversationRequirements,
} from "@app/lib/api/assistant/conversation/mentions";
import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import {
  makeAgentMentionsRateLimitKeyForWorkspace,
  makeKeyCapRateLimitKey,
  makeMessageRateLimitKeyForWorkspace,
  makeMessageRateLimitKeyForWorkspaceActor,
  makeProgrammaticUsageRateLimitKeyForWorkspace,
  MESSAGE_RATE_LIMIT_PER_ACTOR_PER_MINUTE,
  MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
} from "@app/lib/api/assistant/rate_limits";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { maybeUpsertFileAttachment } from "@app/lib/api/files/attachments";
import { getRemainingKeyCapMicroUsd } from "@app/lib/api/programmatic_usage/key_cap";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { extractFromString } from "@app/lib/mentions/format";
import {
  AgentMessageModel,
  ConversationModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { notifyNewProjectConversation } from "@app/lib/notifications/triggers/project-new-conversation";
import { triggerConversationUnreadNotifications } from "@app/lib/notifications/workflows/conversation-unread";
import { computeEffectiveMessageLimit } from "@app/lib/plans/usage/limits";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
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
  AgentMessageTypeWithoutMentions,
  APIErrorWithStatusCode,
  ContentFragmentContextType,
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
  ContentFragmentType,
  ConversationMetadata,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  MentionType,
  ModelId,
  Result,
  RichMentionWithStatus,
  UserMessageContext,
  UserMessageType,
} from "@app/types";
import {
  ConversationError,
  Err,
  isAgentMention,
  isContentFragmentInputWithContentNode,
  isContentFragmentType,
  isProviderWhitelisted,
  isUserMention,
  isUserMessageType,
  md5,
  Ok,
  removeNulls,
  toMentionType,
} from "@app/types";
import {
  isAgentMessageType,
  isProjectConversation,
} from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";

// Rate limit for programmatic usage: 1 message per this amount of dollars per minute.
const PROGRAMMATIC_RATE_LIMIT_DOLLARS_PER_MESSAGE = 3;

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
    metadata,
  }: {
    title: string | null;
    visibility: ConversationVisibility;
    depth?: number;
    triggerId?: ModelId | null;
    spaceId: ModelId | null;
    metadata?: ConversationMetadata;
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
      requestedSpaceIds: spaceId ? [spaceId] : [],
      metadata: metadata ?? {},
    },
    space
  );

  const conversationAsJson = conversation.toJSON();

  if (isProjectConversation(conversationAsJson)) {
    notifyNewProjectConversation(auth, {
      conversation: conversationAsJson,
    });
  }

  return {
    id: conversation.id,
    owner,
    created: conversation.createdAt.getTime(),
    updated: conversation.updatedAt.getTime(),
    sId: conversation.sId,
    title: conversation.title,
    depth: conversation.depth,
    content: [],
    lastReadMs: Date.now(),
    unread: false,
    actionRequired: false,
    hasError: false,
    visibility: conversation.visibility,
    requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
    spaceId: space?.sId ?? null,
    triggerId: conversation.triggerSId,
    metadata: conversation.metadata,
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
 * - If forceDelete is true and the user is the conversation creator: perform a soft-delete
 * - If forceDelete is false and the user is the last participant: perform a soft-delete
 * - Otherwise just remove the user from the participants
 */
export async function deleteOrLeaveConversation(
  auth: Authenticator,
  {
    conversationId,
    forceDelete = false,
  }: {
    conversationId: string;
    forceDelete?: boolean;
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

  let isConversationCreator = false;
  const isCreatorRes = await conversation.isConversationCreator(auth);
  if (!isCreatorRes.isErr()) {
    isConversationCreator = isCreatorRes.value;
  }

  const leaveRes = await conversation.leaveConversation(auth);
  if (leaveRes.isErr()) {
    return new Err(leaveRes.error);
  }

  // If the user was the last member or it was a delete by the conversation creator, soft-delete the conversation.
  if (
    (leaveRes.value.affectedCount === 0 && leaveRes.value.wasLastMember) ||
    (forceDelete && isConversationCreator)
  ) {
    auditLog(
      {
        author: user.toJSON(),
        workspaceId: conversation.workspaceId,
        conversationId,
        wasLastMember: leaveRes.value.wasLastMember,
        isConversationCreator,
      },
      "Conversation soft-deleted"
    );
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

export function isUserMessageContextValid(
  auth: Authenticator,
  req: NextApiRequest,
  context: UserMessageContext
): boolean {
  const authMethod = auth.authMethod();

  if (authMethod === "system_api_key") {
    return true;
  }

  const {
    "user-agent": userAgent,
    "x-dust-extension-version": extensionVersion,
    "x-zendesk-user-id": zendeskUserId,
  } = req.headers;

  switch (context.origin) {
    case "api":
    case "project_butler":
      return true;
    case "excel":
    case "gsheet":
    case "make":
    case "n8n":
    case "powerpoint":
    case "zapier":
      return authMethod === "api_key";
    case "zendesk":
      return (
        (authMethod === "api_key" || authMethod === "oauth") && !!zendeskUserId
      );
    case "cli":
    case "cli_programmatic":
      return authMethod === "oauth" && userAgent === "Dust CLI";
    case "extension":
      return authMethod === "oauth" && !!extensionVersion;
    case "raycast":
      return authMethod === "oauth" && userAgent === "undici";
    case "email":
    case "slack":
    case "slack_workflow":
    case "teams":
    case "transcript":
    case "triggered":
    case "triggered_programmatic":
    case "onboarding_conversation":
    case "agent_copilot":
    case "project_kickoff":
    case "web":
      return false;
    default:
      assertNever(context.origin);
  }
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
    doNotAssociateUser,
  }: {
    conversation: ConversationType;
    content: string;
    mentions: MentionType[];
    context: UserMessageContext;
    agenticMessageData?: AgenticMessageData;
    skipToolsValidation: boolean;
    doNotAssociateUser?: boolean;
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

  if (isProjectConversation(conversation)) {
    // Check if the user is a member of the space.
    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (!space) {
      return new Err({
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Space not found",
        },
      });
    }
    if (!space.isMember(auth)) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not a member of the project.",
        },
      });
    }
  }

  // Check plan and rate limit.
  const limitResult = await checkMessagesLimit(auth, { mentions, context });
  if (limitResult.isErr()) {
    return limitResult;
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
      supportedModelConfig?.featureFlag &&
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

    // Enrich context with auth data for analytics tracking.
    const enrichedContext: UserMessageContext = {
      ...context,
      apiKeyId: auth.key()?.id ?? null,
      authMethod: auth.authMethod(),
    };

    // Return the user message without mentions.
    // This way typescript forces us to create the mentions after the user message is created.
    const userMessageWithoutMentions = await createUserMessage(auth, {
      conversation,
      content,
      metadata: {
        type: "create",
        user: doNotAssociateUser ? null : (user?.toJSON() ?? null),
        rank: nextMessageRank++,
        context: enrichedContext,
        agenticMessageData,
      },
      transaction: t,
    });

    // If a user is mentioned, we want to make sure the conversation has a title.
    // This ensures that mentioned users receive a notification with a conversation title.
    if (mentions.some(isUserMention)) {
      await ensureConversationTitle(auth, {
        conversation,
        userMessage: {
          ...userMessageWithoutMentions,
          richMentions: [],
          mentions: [],
        },
      });
    }

    const richMentions = await createUserMentions(auth, {
      mentions,
      message: userMessageWithoutMentions,
      conversation,
      transaction: t,
    });

    const { agentMessages, richMentions: agentRichMentions } =
      await createAgentMessages(auth, {
        conversation,
        metadata: {
          type: "create",
          mentions,
          agentConfigurations,
          skipToolsValidation,
          nextMessageRank,
          userMessage: userMessageWithoutMentions,
        },
        transaction: t,
      });

    richMentions.push(...agentRichMentions);

    const userMessage = {
      ...userMessageWithoutMentions,
      richMentions: richMentions,
      mentions: richMentions.map(toMentionType),
    };

    await ConversationResource.markAsUpdated(auth, { conversation, t });

    // Mark the conversation as read for the current user.
    await ConversationResource.markAsReadForAuthUser(auth, {
      conversation,
      transaction: t,
    });

    return {
      userMessage,
      agentMessages,
    };
  });

  const conversationRes = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationRes) {
    throw new Error(
      "Unexpected: Conversation not found after posting message."
    );
  }
  await triggerConversationUnreadNotifications(auth, {
    conversation: conversationRes,
    messageId: userMessage.sId,
  });

  void ServerSideTracking.trackUserMessage({
    userMessage,
    workspace: conversation.owner,
    userId: user ? `user-${user.id}` : `api-${context.username}`,
    conversationId: conversation.sId,
    agentMessages,
  });

  // Run agent loop workflows after the transaction commits, to ensure messages are persisted.
  if (agentMessages.length > 0) {
    await runAgentLoopWorkflow({
      auth,
      agentMessages,
      conversation,
      userMessage,
    });
  }

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
    case "pending":
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

      const userMessageWithoutMentions = await createUserMessage(auth, {
        conversation,
        content,

        metadata: {
          type: "edit",
          message,
        },
        transaction: t,
      });

      const richMentions = await createUserMentions(auth, {
        mentions,
        message: userMessageWithoutMentions,
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

        const agentMessages: AgentMessageType[] = [];

        // Only create agent messages if there are no agent messages after the edited user message
        if (!hasAgentMessagesAfter) {
          const nextMessageRank =
            ((await MessageModel.max<number | null, MessageModel>("rank", {
              where: {
                conversationId: conversation.id,
              },
              transaction: t,
            })) ?? -1) + 1;

          const {
            agentMessages: newAgentMessages,
            richMentions: agentRichMentions,
          } = await createAgentMessages(auth, {
            conversation,
            metadata: {
              type: "create",
              mentions,
              agentConfigurations,
              skipToolsValidation,
              nextMessageRank,
              userMessage: userMessageWithoutMentions,
            },
            transaction: t,
          });

          richMentions.push(...agentRichMentions);
          agentMessages.push(...newAgentMessages);
        }
        const userMessage = {
          ...userMessageWithoutMentions,
          richMentions: richMentions,
          mentions: richMentions.map(toMentionType),
        };

        await ConversationResource.markAsUpdated(auth, { conversation, t });

        return {
          userMessage,
          agentMessages,
        };
      }

      // Mark the conversation as read for the current user.
      await ConversationResource.markAsReadForAuthUser(auth, {
        conversation,
        transaction: t,
      });

      const userMessage = {
        ...userMessageWithoutMentions,
        richMentions: richMentions,
        mentions: richMentions.map(toMentionType),
      };

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

  // Run agent loop workflows after the transaction commits, to ensure messages are persisted.
  if (agentMessages.length > 0) {
    await runAgentLoopWorkflow({
      auth,
      agentMessages,
      conversation,
      userMessage,
    });
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
    conversation: ConversationType;
    agentMessage: AgentMessageTypeWithoutMentions;
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
  const userMentions = extractFromString(agentMessage.content).filter(
    isUserMention
  );

  const richMentions: RichMentionWithStatus[] = [];
  if (userMentions.length > 0) {
    await withTransaction(async (t) => {
      richMentions.push(
        ...(await createUserMentions(auth, {
          mentions: userMentions,
          message: agentMessage,
          conversation,
          transaction: t,
        }))
      );
    });

    // Publish the new agent message event to all open tabs to maintain state synchronization.
    await publishAgentMessagesEvents(conversation, [
      { ...agentMessage, richMentions },
    ]);
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
  // Find the parent user message to get the original context for rate limiting.
  // This ensures retries are counted with the same origin (web vs programmatic) as the original.
  const parentUserMessage = conversation.content
    .flat()
    .find(
      (m): m is UserMessageType =>
        isUserMessageType(m) && m.sId === message.parentMessageId
    );

  if (!parentUserMessage) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not find the parent user message for this retry.",
      },
    });
  }

  // Check plan and rate limit before retrying.
  const mentions = [{ configurationId: message.configuration.sId }];
  const limitResult = await checkMessagesLimit(auth, {
    mentions,
    context: parentUserMessage.context,
  });
  if (limitResult.isErr()) {
    return limitResult;
  }

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

      // Check if agent is still available to the user.
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: message.configuration.sId,
        variant: "light",
      });
      if (!agentConfiguration || !canAccessAgent(agentConfiguration)) {
        throw new AgentMessageError(
          "Invalid agent message retry request, the agent is no longer available to you."
        );
      }

      // Agent could be part of a conversation that was moved to a space OR the agent configuration could have changed to use a space that is not usable in a project.
      if (isProjectConversation(conversation)) {
        const canAgentBeUsed = await canAgentBeUsedInProjectConversation(auth, {
          configuration: agentConfiguration,
          conversation,
        });
        if (!canAgentBeUsed) {
          throw new AgentMessageError(
            "Invalid agent message retry request, the agent is restricted by space usage."
          );
        }
      }

      const { agentMessages } = await createAgentMessages(auth, {
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

  // Project conversations only allow content fragments from the project space or the global space.
  if (
    isProjectConversation(conversation) &&
    isContentFragmentInputWithContentNode(cf)
  ) {
    const dsView = await DataSourceViewResource.fetchById(
      auth,
      cf.nodeDataSourceViewId
    );
    if (!dsView) {
      return new Err(new Error("Data source view not found"));
    }
    if (
      dsView.space.sId !== conversation.spaceId &&
      dsView.space.kind !== "global"
    ) {
      return new Err(
        new Error(
          "Only content fragments from the project space or the global space are allowed in a project conversation"
        )
      );
    }
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

  const render = await contentFragment.renderFromMessage(auth, {
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

    const relatedContentFragments = getRelatedContentFragments(
      conversation,
      message
    );

    const userMessage = await createUserMessage(auth, {
      conversation,
      content: "deleted",
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
    { ...userMessage, contentFragments: [], mentions: [], richMentions: [] },
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

  const { agentMessages } = await withTransaction(async (t) => {
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

interface MessageLimit {
  isLimitReached: boolean;
  limitType: "rate_limit_error" | "plan_message_limit_exceeded" | null;
}

async function checkMessagesLimit(
  auth: Authenticator,
  {
    mentions,
    context,
  }: {
    mentions: MentionType[];
    context: UserMessageContext;
  }
): Promise<Result<void, APIErrorWithStatusCode>> {
  const messageLimit = await isMessagesLimitReached(auth, {
    mentions,
    context,
  });
  if (messageLimit.isLimitReached && messageLimit.limitType) {
    return new Err({
      status_code: 403,
      api_error: {
        type: messageLimit.limitType,
        message:
          messageLimit.limitType === "plan_message_limit_exceeded"
            ? "The message limit for this plan has been exceeded."
            : "Rate limit exceeded. Please retry later.",
      },
    });
  }
  return new Ok(undefined);
}

// For programmatic usage, apply credit-based rate limiting.
// This prevents close-to-0 credit attacks where many messages are sent simultaneously
// before token usage is computed. Rate limit is based on total credit amount in dollars.
async function checkProgrammaticUsageRateLimit(
  auth: Authenticator
): Promise<MessageLimit> {
  const owner = auth.getNonNullableWorkspace();
  const activeCredits = await CreditResource.listActive(auth);

  // Calculate total remaining credits in dollars (micro USD / 1,000,000).
  const totalRemainingCreditsDollars =
    activeCredits.reduce(
      (sum, c) => sum + (c.initialAmountMicroUsd - c.consumedAmountMicroUsd),
      0
    ) / 1_000_000;

  // Minimum of 1 to allow at least some messages even with very low credits.
  const maxMessagesPerMinute = Math.max(
    1,
    Math.floor(
      totalRemainingCreditsDollars / PROGRAMMATIC_RATE_LIMIT_DOLLARS_PER_MESSAGE
    )
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

  // Per-key rate limiting for keys with a cap.
  // Prevents close-to-0 cap attacks where many messages are sent simultaneously.
  const remainingCapMicroUsd = await getRemainingKeyCapMicroUsd(auth);
  if (remainingCapMicroUsd !== null) {
    const keyAuth = auth.key();
    if (keyAuth) {
      const remainingCapDollars = remainingCapMicroUsd / 1_000_000;
      const keyMaxMessagesPerMinute = Math.max(
        1,
        Math.floor(
          remainingCapDollars / PROGRAMMATIC_RATE_LIMIT_DOLLARS_PER_MESSAGE
        )
      );

      const keyRemainingMessages = await rateLimiter({
        key: makeKeyCapRateLimitKey(keyAuth.id),
        maxPerTimeframe: keyMaxMessagesPerMinute,
        timeframeSeconds: 60,
        logger,
      });

      if (keyRemainingMessages <= 0) {
        logger.info(
          {
            workspaceId: owner.sId,
            keyId: keyAuth.id,
            remainingCapDollars,
          },
          "Pre-emptive rate limit triggered for key cap."
        );

        statsDClient.increment(
          "assistant.rate_limiter.key_cap.credit_based_limit_triggered",
          1,
          { workspace_id: owner.sId }
        );

        return {
          isLimitReached: true,
          limitType: "rate_limit_error",
        };
      }
    }
  }

  return {
    isLimitReached: false,
    limitType: null,
  };
}

function getMessageRateLimitActor(auth: Authenticator):
  | {
      type: "api_key";
      id: number;
    }
  | {
      type: "user";
      id: number;
    }
  | null {
  const user = auth.user();
  if (user) {
    return { type: "user", id: user.id };
  }

  const apiKey = auth.key();
  if (apiKey) {
    return { type: "api_key", id: apiKey.id };
  }

  return null;
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
  const actor = getMessageRateLimitActor(auth);

  if (actor) {
    const actorRemainingMessages = await rateLimiter({
      key: makeMessageRateLimitKeyForWorkspaceActor(owner, actor),
      maxPerTimeframe: MESSAGE_RATE_LIMIT_PER_ACTOR_PER_MINUTE,
      timeframeSeconds: MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
      logger,
    });

    if (actorRemainingMessages <= 0) {
      return {
        isLimitReached: true,
        limitType: "rate_limit_error",
      };
    }
  }

  if (isProgrammaticUsage(auth, { userMessageOrigin: context.origin })) {
    return checkProgrammaticUsageRateLimit(auth);
  }

  // Checking rate limit
  const activeSeats =
    await MembershipResource.countActiveSeatsInWorkspaceCached(owner.sId);

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

  // Accounting for each agent mention separately. Human mentions don't cost
  // anything (no LLM call) so we don't count them toward the limit.
  // The return value won't account for the parallel calls depending on network timing
  // but we are fine with a little bit of overusage.
  const effectiveMaxMessages = computeEffectiveMessageLimit({
    planCode: plan.code,
    maxMessages,
    activeSeats,
  });
  const agentMentions = mentions.filter(isAgentMention);
  const remainingMentions = await Promise.all(
    agentMentions.map(() =>
      rateLimiter({
        key: makeAgentMentionsRateLimitKeyForWorkspace(
          owner,
          maxMessagesTimeframe
        ),
        maxPerTimeframe: effectiveMaxMessages,
        timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
        logger,
      })
    )
  );
  // We let the user talk to all agents if any of the rate limiter answered "ok".
  // Subsequent calls to this function would block the user anyway.
  // If remainingMentions is empty, don't block the call (user mention scenario).
  const isLimitReached =
    remainingMentions.length > 0 &&
    remainingMentions.filter((r) => r > 0).length === 0;
  return {
    isLimitReached,
    limitType: isLimitReached ? "plan_message_limit_exceeded" : null,
  };
}
