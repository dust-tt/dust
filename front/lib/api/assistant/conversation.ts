import assert from "assert";
import _, { isEqual, sortBy } from "lodash";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import { canReadMessage } from "@app/lib/api/assistant/messages";
import { getContentFragmentGroupIds } from "@app/lib/api/assistant/permissions";
import {
  makeAgentMentionsRateLimitKeyForWorkspace,
  makeMessageRateLimitKeyForWorkspace,
} from "@app/lib/api/assistant/rate_limits";
import {
  publishAgentMessageEventOnMessageRetry,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { maybeUpsertFileAttachment } from "@app/lib/api/files/attachments";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  AgentMessage,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { isEmailValid, normalizeArrays } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
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
  PlanType,
  Result,
  UserMessageContext,
  UserMessageType,
  UserType,
  WorkspaceType,
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

// Soft assumption that we will not have more than 10 mentions in the same user message.
const MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE = 10;

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
  }: {
    title: string | null;
    visibility: ConversationVisibility;
    depth?: number;
    triggerId?: ModelId | null;
  }
): Promise<ConversationType> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.makeNew(auth, {
    sId: generateRandomModelSId(),
    title,
    visibility,
    depth,
    triggerId,
    requestedGroupIds: [],
  });

  return {
    id: conversation.id,
    owner,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    title: conversation.title,
    visibility: conversation.visibility,
    depth: conversation.depth,
    triggerId: conversation.triggerSId(),
    content: [],
    unread: false,
    actionRequired: false,
    requestedGroupIds:
      conversation.getConversationRequestedGroupIdsFromModel(auth),
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
): Promise<Result<{ success: true }, ConversationError>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  if (destroy) {
    await conversation.delete(auth);
  } else {
    await conversation.updateVisibilityToDeleted();
  }
  return new Ok({ success: true });
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
  conversation: ConversationType | ConversationWithoutContentType,
  messageId: string
): Promise<"user_message" | "agent_message" | "content_fragment" | null> {
  if (!auth.workspace()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await Message.findOne({
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

export async function getLastUserMessage(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const message = await Message.findOne({
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
        model: UserMessage,
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
 * Conversation API
 */

/**
 * To avoid deadlocks when using Postgresql advisory locks, please make sure to not issue any other
 * SQL query outside of the transaction `t` that is holding the lock.
 * Otherwise, the other query will be competing for a connection in the database connection pool,
 * resulting in a potential deadlock when the pool is fully occupied.
 */
async function getConversationRankVersionLock(
  conversation: ConversationType,
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
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      duration: new Date().getTime() - now.getTime(),
      lockKey,
    },
    "[ASSISTANT_TRACE] Advisory lock acquired"
  );
}

async function attributeUserFromWorkspaceAndEmail(
  workspace: WorkspaceType | null,
  email: string | null
): Promise<UserType | null> {
  if (!workspace || !email || !isEmailValid(email)) {
    return null;
  }

  const matchingUser = await UserResource.fetchByEmail(email);
  if (!matchingUser) {
    return null;
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: matchingUser,
      workspace,
    });

  return membership ? matchingUser.toJSON() : null;
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
    skipToolsValidation,
  }: {
    conversation: ConversationType;
    content: string;
    mentions: MentionType[];
    context: UserMessageContext;
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

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "conversation_access_restricted",
        message: "Conversation cannot be accessed.",
      },
    });
  }

  // Check plan and rate limit.
  const messageLimit = await isMessagesLimitReached({
    owner,
    plan,
    mentions,
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
      if (context.origin === "run_agent") {
        return;
      }

      return ConversationResource.upsertParticipation(auth, {
        conversation,
        action: "posted",
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
          type: "invalid_request_error",
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
  const { userMessage, agentMessages, agentMessageRows } =
    await withTransaction(async (t) => {
      // Since we are getting a transaction level lock, we can't execute any other SQL query outside of
      // this transaction, otherwise this other query will be competing for a connection in the database
      // connection pool, resulting in a deadlock.
      await getConversationRankVersionLock(conversation, t);

      let nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;

      // Fetch originMessage to ensure it exists
      const originMessage = context.originMessageId
        ? await Message.findOne({
            where: {
              workspaceId: owner.id,
              sId: context.originMessageId,
            },
          })
        : null;

      async function createMessageAndUserMessage(workspace: WorkspaceType) {
        return Message.create(
          {
            sId: generateRandomModelSId(),
            rank: nextMessageRank++,
            conversationId: conversation.id,
            parentId: null,
            userMessageId: (
              await UserMessage.create(
                {
                  content,
                  // TODO(MCP Clean-up): Rename field in DB.
                  clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
                  userContextUsername: context.username,
                  userContextTimezone: context.timezone,
                  userContextFullName: context.fullName,
                  userContextEmail: context.email,
                  userContextProfilePictureUrl: context.profilePictureUrl,
                  userContextOrigin: context.origin,
                  userContextOriginMessageId: originMessage?.sId ?? null,
                  userContextLastTriggerRunAt: context.lastTriggerRunAt,
                  userId: user
                    ? user.id
                    : (
                        await attributeUserFromWorkspaceAndEmail(
                          workspace,
                          context.email
                        )
                      )?.id,
                  workspaceId: workspace.id,
                },
                { transaction: t }
              )
            ).id,
            workspaceId: workspace.id,
          },
          {
            transaction: t,
          }
        );
      }

      const m = await createMessageAndUserMessage(owner);
      const userMessage: UserMessageType = {
        id: m.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "user_message",
        visibility: "visible",
        version: 0,
        user: user?.toJSON() ?? null,
        mentions,
        content,
        context,
        rank: m.rank,
      };

      // Mark the conversation as unread for all participants except the user.
      await ConversationResource.markAsUnreadForOtherParticipants(auth, {
        conversation,
        excludedUser: user?.toJSON(),
      });

      const results: ({ row: AgentMessage; m: AgentMessageType } | null)[] =
        await Promise.all(
          mentions.filter(isAgentMention).map((mention) => {
            // For each assistant/agent mention, create an "empty" agent message.
            return (async () => {
              // `getAgentConfiguration` checks that we're only pulling a configuration from the
              // same workspace or a global one.
              const configuration = agentConfigurations.find(
                (ac) => ac.sId === mention.configurationId
              );
              if (!configuration) {
                return null;
              }

              await Mention.create(
                {
                  messageId: m.id,
                  agentConfigurationId: configuration.sId,
                  workspaceId: owner.id,
                },
                { transaction: t }
              );

              const agentMessageRow = await AgentMessage.create(
                {
                  status: "created",
                  agentConfigurationId: configuration.sId,
                  agentConfigurationVersion: configuration.version,
                  workspaceId: owner.id,
                  skipToolsValidation,
                },
                { transaction: t }
              );
              const messageRow = await Message.create(
                {
                  sId: generateRandomModelSId(),
                  rank: nextMessageRank++,
                  conversationId: conversation.id,
                  parentId: userMessage.id,
                  agentMessageId: agentMessageRow.id,
                  workspaceId: owner.id,
                },
                {
                  transaction: t,
                }
              );

              return {
                row: agentMessageRow,
                m: {
                  id: messageRow.id,
                  agentMessageId: agentMessageRow.id,
                  created: agentMessageRow.createdAt.getTime(),
                  completedTs: agentMessageRow.completedAt?.getTime() ?? null,
                  sId: messageRow.sId,
                  type: "agent_message",
                  visibility: "visible",
                  version: 0,
                  parentMessageId: userMessage.sId,
                  status: "created",
                  actions: [],
                  content: null,
                  chainOfThought: null,
                  rawContents: [],
                  error: null,
                  configuration,
                  rank: messageRow.rank,
                  skipToolsValidation: agentMessageRow.skipToolsValidation,
                  contents: [],
                  parsedContents: {},
                } satisfies AgentMessageType,
              };
            })();
          })
        );

      const nonNullResults = results.filter((r) => r !== null) as {
        row: AgentMessage;
        m: AgentMessageType;
      }[];

      await updateConversationRequestedGroupIds(auth, {
        agents: nonNullResults.map(({ m }) => m.configuration),
        conversation,
        t,
      });

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
        agentConfigurationId: agentMessage.configuration.sId,
        workspaceId: owner.sId,
      });
    }
  }

  void ServerSideTracking.trackUserMessage({
    userMessage,
    workspace: conversation.owner,
    userId: user ? `user-${user.id}` : `api-${context.username}`,
    conversationId: conversation.sId,
    agentMessages,
  });

  const agentMessageRowById = new Map<ModelId, AgentMessage>();
  for (const agentMessageRow of agentMessageRows) {
    agentMessageRowById.set(agentMessageRow.id, agentMessageRow);
  }

  // TODO(DURABLE-AGENTS 2025-07-17): Publish message events to all open tabs to maintain
  // conversation state synchronization in multiplex mode. This is a temporary solution -
  // we should move this to a dedicated real-time sync mechanism.
  await publishMessageEventsOnMessagePostOrEdit(
    conversation,
    userMessage,
    agentMessages
  );

  await concurrentExecutor(
    agentMessages,
    async (agentMessage) => {
      // TODO(DURABLE-AGENTS 2025-07-16): Consolidate around agentMessage.
      const agentMessageRow = agentMessageRowById.get(
        agentMessage.agentMessageId
      );
      assert(
        agentMessageRow,
        `Agent message row not found for agent message ${agentMessage.agentMessageId}`
      );

      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: agentMessage.configuration.sId,
        variant: "full",
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
        },
        startStep: 0,
      });
    },
    { concurrency: MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE }
  );

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
 * This method creates a new user message version, and if there are new agent mentions, run them.
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

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "conversation_access_restricted",
        message: "Conversation cannot be accessed.",
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

  if (message.mentions.filter((m) => isAgentMention(m)).length > 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Editing a message that already has agent mentions is not yet supported",
      },
    });
  }

  if (
    !conversation.content[conversation.content.length - 1].some(
      (m) => m.sId === message.sId
    ) &&
    mentions.filter((m) => isAgentMention(m)).length > 0
  ) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Adding agent mentions when editing is only supported for the last message " +
          "of the conversation",
      },
    });
  }

  let userMessage: UserMessageType | null = null;
  let agentMessages: AgentMessageType[] = [];
  let agentMessageRows: AgentMessage[] = [];

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
          type: "invalid_request_error",
          message:
            `Assistant ${agentConfig.name} is based on a model that was disabled ` +
            `by your workspace admin. Please edit the agent to use another model ` +
            `(advanced settings in the Instructions panel).`,
        },
      });
    }
  }

  try {
    // In one big transaction creante all Message, UserMessage, AgentMessage and Mention rows.
    const result = await withTransaction(async (t) => {
      // Since we are getting a transaction level lock, we can't execute any other SQL query outside of
      // this transaction, otherwise this other query will be competing for a connection in the database
      // connection pool, resulting in a deadlock.
      await getConversationRankVersionLock(conversation, t);

      const messageRow = await Message.findOne({
        where: {
          sId: message.sId,
          conversationId: conversation.id,
          workspaceId: owner.id,
        },
        include: [
          {
            model: UserMessage,
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
      const newerMessage = await Message.findOne({
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
      const userMessageRow = messageRow.userMessage;
      // adding messageRow as param otherwise Ts doesn't get it can't be null
      async function createMessageAndUserMessage(
        workspace: WorkspaceType,
        messageRow: Message
      ) {
        return Message.create(
          {
            sId: generateRandomModelSId(),
            rank: messageRow.rank,
            conversationId: conversation.id,
            parentId: messageRow.parentId,
            version: messageRow.version + 1,
            userMessageId: (
              await UserMessage.create(
                {
                  content,
                  // No support for client-side MCP servers when editing/retrying a user message.
                  clientSideMCPServerIds: [],
                  userContextUsername: userMessageRow.userContextUsername,
                  userContextTimezone: userMessageRow.userContextTimezone,
                  userContextFullName: userMessageRow.userContextFullName,
                  userContextEmail: userMessageRow.userContextEmail,
                  userContextProfilePictureUrl:
                    userMessageRow.userContextProfilePictureUrl,
                  userContextOrigin: userMessageRow.userContextOrigin,
                  userContextLastTriggerRunAt:
                    userMessageRow.userContextLastTriggerRunAt,
                  userId: userMessageRow.userId
                    ? userMessageRow.userId
                    : (
                        await attributeUserFromWorkspaceAndEmail(
                          workspace,
                          userMessageRow.userContextEmail
                        )
                      )?.id,
                  workspaceId: workspace.id,
                },
                { transaction: t }
              )
            ).id,
            workspaceId: workspace.id,
          },
          {
            transaction: t,
          }
        );
      }

      const m = await createMessageAndUserMessage(owner, messageRow);

      const userMessage: UserMessageType = {
        id: m.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "user_message",
        visibility: m.visibility,
        version: m.version,
        user: user?.toJSON() ?? null,
        mentions,
        content,
        context: message.context,
        rank: m.rank,
      };

      // Mark the conversation as unread for all participants except the user.
      await ConversationResource.markAsUnreadForOtherParticipants(auth, {
        conversation,
        excludedUser: user?.toJSON(),
      });

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
      const results: ({
        row: AgentMessage;
        m: AgentMessageType;
      } | null)[] = await Promise.all(
        mentions.filter(isAgentMention).map((mention) => {
          // For each assistant/agent mention, create an "empty" agent message.
          return (async () => {
            // `getAgentConfiguration` checks that we're only pulling a configuration from the
            // same workspace or a global one.
            const configuration = agentConfigurations.find(
              (ac) => ac.sId === mention.configurationId
            );
            if (!configuration) {
              return null;
            }

            await Mention.create(
              {
                messageId: m.id,
                agentConfigurationId: configuration.sId,
                workspaceId: owner.id,
              },
              { transaction: t }
            );

            const agentMessageRow = await AgentMessage.create(
              {
                status: "created",
                agentConfigurationId: configuration.sId,
                agentConfigurationVersion: configuration.version,
                workspaceId: owner.id,
                skipToolsValidation,
              },
              { transaction: t }
            );
            const messageRow = await Message.create(
              {
                sId: generateRandomModelSId(),
                rank: nextMessageRank++,
                conversationId: conversation.id,
                parentId: userMessage.id,
                agentMessageId: agentMessageRow.id,
                workspaceId: owner.id,
              },
              {
                transaction: t,
              }
            );

            return {
              row: agentMessageRow,
              m: {
                id: messageRow.id,
                agentMessageId: agentMessageRow.id,
                created: agentMessageRow.createdAt.getTime(),
                completedTs: agentMessageRow.completedAt?.getTime() ?? null,
                sId: messageRow.sId,
                type: "agent_message",
                visibility: "visible",
                version: 0,
                parentMessageId: userMessage.sId,
                status: "created",
                actions: [],
                content: null,
                chainOfThought: null,
                rawContents: [],
                error: null,
                configuration,
                rank: messageRow.rank,
                skipToolsValidation: agentMessageRow.skipToolsValidation,
                contents: [],
                parsedContents: {},
              } satisfies AgentMessageType,
            };
          })();
        })
      );

      const nonNullResults = results.filter((r) => r !== null) as {
        row: AgentMessage;
        m: AgentMessageType;
      }[];

      await updateConversationRequestedGroupIds(auth, {
        agents: nonNullResults.map(({ m }) => m.configuration),
        conversation,
        t,
      });

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

  assert(
    agentMessageRows.length === agentMessages.length,
    "Unreachable: agentMessageRows and agentMessages mismatch"
  );

  if (agentMessages.length > 0) {
    for (const agentMessage of agentMessages) {
      void signalAgentUsage({
        agentConfigurationId: agentMessage.configuration.sId,
        workspaceId: owner.sId,
      });
    }
  }

  const agentMessageRowById = new Map<ModelId, AgentMessage>();
  for (const agentMessageRow of agentMessageRows) {
    agentMessageRowById.set(agentMessageRow.id, agentMessageRow);
  }

  await concurrentExecutor(
    agentMessages,
    async (agentMessage) => {
      // TODO(DURABLE-AGENTS 2025-07-16): Consolidate around agentMessage.
      const agentMessageRow = agentMessageRowById.get(
        agentMessage.agentMessageId
      );
      assert(
        agentMessageRow,
        `Agent message row not found for agent message ${agentMessage.agentMessageId}`
      );

      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: agentMessage.configuration.sId,
        variant: "full",
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
        },
        startStep: 0,
      });
    },
    { concurrency: MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE }
  );

  // TODO(DURABLE-AGENTS 2025-07-17): Publish message events to all open tabs to maintain
  // conversation state synchronization in multiplex mode. This is a temporary solution -
  // we should move this to a dedicated real-time sync mechanism.
  await publishMessageEventsOnMessagePostOrEdit(
    conversation,
    userMessage,
    agentMessages
  );

  return new Ok({
    userMessage,
    agentMessages,
  });
}

class AgentMessageError extends Error {}

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
  if (!canReadMessage(auth, message)) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "The message to retry is not accessible.",
      },
    });
  }

  let agentMessageResult: {
    agentMessage: AgentMessageType;
    agentMessageRow: AgentMessage;
  } | null = null;
  try {
    agentMessageResult = await withTransaction(async (t) => {
      await getConversationRankVersionLock(conversation, t);

      const messageRow = await Message.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
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
      const agentMessageRow = await AgentMessage.create(
        {
          status: "created",
          agentConfigurationId: messageRow.agentMessage.agentConfigurationId,
          agentConfigurationVersion:
            messageRow.agentMessage.agentConfigurationVersion,
          workspaceId: auth.getNonNullableWorkspace().id,
          skipToolsValidation: messageRow.agentMessage.skipToolsValidation,
        },
        { transaction: t }
      );
      const m = await Message.create(
        {
          sId: generateRandomModelSId(),
          rank: messageRow.rank,
          conversationId: conversation.id,
          parentId: messageRow.parentId,
          version: messageRow.version + 1,
          agentMessageId: agentMessageRow.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        {
          transaction: t,
        }
      );

      await updateConversationRequestedGroupIds(auth, {
        agents: [message.configuration],
        conversation,
        t,
      });

      // Find all sibling messages (messages with the same parentId)
      const siblingMessages = await Message.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          parentId: messageRow.parentId,
          visibility: "visible",
        },
        transaction: t,
      });

      // Find the maximum rank among all sibling messages
      const maxSiblingRank = Math.max(...siblingMessages.map((m) => m.rank));

      // Hide all messages with ranks greater than the maximum sibling rank
      await Message.update(
        { visibility: "hidden" },
        {
          where: {
            conversationId: conversation.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            rank: {
              [Op.gt]: maxSiblingRank,
            },
            visibility: "visible", // Only hide visible messages (not already deleted/hidden)
          },
          transaction: t,
          validate: false, // Skip validation hooks since we're only updating visibility
        }
      );

      const agentMessage: AgentMessageType = {
        id: m.id,
        agentMessageId: agentMessageRow.id,
        created: m.createdAt.getTime(),
        completedTs: agentMessageRow.completedAt?.getTime() ?? null,
        sId: m.sId,
        type: "agent_message",
        visibility: m.visibility,
        version: m.version,
        parentMessageId: message.parentMessageId,
        status: "created",
        actions: [],
        content: null,
        chainOfThought: null,
        rawContents: [],
        error: null,
        configuration: message.configuration,
        rank: m.rank,
        skipToolsValidation: agentMessageRow.skipToolsValidation,
        contents: [],
        parsedContents: {},
      };

      return {
        agentMessage,
        agentMessageRow,
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
    variant: "full",
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
    },
    startStep: 0,
  });

  // TODO(DURABLE-AGENTS 2025-07-17): Publish message events to all open tabs to maintain
  // conversation state synchronization in multiplex mode. This is a temporary solution -
  // we should move this to a dedicated real-time sync mechanism.
  await publishAgentMessageEventOnMessageRetry(conversation, agentMessage);

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

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
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
    await getConversationRankVersionLock(conversation, t);

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
      ((await Message.max<number | null, Message>("rank", {
        where: {
          conversationId: conversation.id,
        },
        transaction: t,
      })) ?? -1) + 1;
    const messageRow = await Message.create(
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
      await updateConversationRequestedGroupIds(auth, {
        contentFragment: cf,
        conversation,
        t,
      });
    }

    return { contentFragment, messageRow };
  });
  const render = await contentFragment.renderFromMessage({
    auth,
    conversationId: conversation.sId,
    message: messageRow,
  });

  return new Ok(render);
}

export interface MessageLimit {
  isLimitReached: boolean;
  limitType: "rate_limit_error" | "plan_message_limit_exceeded" | null;
}

async function isMessagesLimitReached({
  owner,
  plan,
  mentions,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  mentions: MentionType[];
}): Promise<MessageLimit> {
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

/**
 * Update the conversation requestedGroupIds based on the mentioned agents. This function is purely
 * additive - requirements are never removed.
 *
 * Each agent's requestedGroupIds represents a set of requirements that must be satisfied. When an
 * agent is mentioned in a conversation, its requirements are added to the conversation's
 * requirements.
 *
 * - Within each requirement (sub-array), groups are combined with OR logic.
 * - Different requirements (different sub-arrays) are combined with AND logic.
 */
export async function updateConversationRequestedGroupIds(
  auth: Authenticator,
  {
    agents,
    contentFragment,
    conversation,
    t,
  }: {
    agents?: LightAgentConfigurationType[];
    contentFragment?: ContentFragmentInputWithContentNode;
    conversation: ConversationWithoutContentType;
    t: Transaction;
  }
): Promise<void> {
  let newRequirements: string[][] = [];
  if (agents) {
    newRequirements = agents.flatMap((agent) => agent.requestedGroupIds);
  }
  if (contentFragment) {
    const rawRequestedGroupIds = await getContentFragmentGroupIds(
      auth,
      contentFragment
    );
    const requestedGroupIds = rawRequestedGroupIds.map((gs) =>
      gs.map((gId) =>
        GroupResource.modelIdToSId({
          id: gId,
          workspaceId: auth.getNonNullableWorkspace().id,
        })
      )
    );
    newRequirements.push(...requestedGroupIds);
  }
  // Remove duplicates and sort each requirement.
  newRequirements = _.uniqWith(
    newRequirements.map((r) => sortBy(r)),
    isEqual
  );
  const currentRequirements = conversation.requestedGroupIds;

  // Check if each new requirement already exists in current requirements.
  const areAllRequirementsPresent = newRequirements.every((newReq) =>
    currentRequirements.some(
      // newReq was sorted, so we need to sort currentReq as well.
      (currentReq) => isEqual(newReq, sortBy(currentReq))
    )
  );

  // Early return if all new requirements are already present.
  if (areAllRequirementsPresent) {
    return;
  }

  // Get missing requirements.
  const requirementsToAdd = newRequirements.filter(
    (newReq) =>
      !currentRequirements.some((currentReq) =>
        // newReq was sorted, so we need to sort currentReq as well.
        isEqual(newReq, sortBy(currentReq))
      )
  );

  // Convert all sIds to modelIds.
  const sIdToModelId = new Map<string, number>();
  const getModelId = (sId: string) => {
    if (!sIdToModelId.has(sId)) {
      const id = getResourceIdFromSId(sId);
      if (id === null) {
        throw new Error("Unexpected: invalid group id");
      }
      sIdToModelId.set(sId, id);
    }
    return sIdToModelId.get(sId)!;
  };

  const allRequirements = [
    ...currentRequirements.map((req) => sortBy(req.map(getModelId))),
    ...requirementsToAdd.map((req) => sortBy(req.map(getModelId))),
  ];

  await ConversationResource.updateRequestedGroupIds(
    auth,
    conversation.sId,
    normalizeArrays(allRequirements),
    t
  );
}
