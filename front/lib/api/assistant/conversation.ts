import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { StepContext } from "@app/lib/actions/types";
import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import { fetchPrecedingContentFragments } from "@app/lib/api/assistant/content_fragments";
import { runAgentLoopWorkflow } from "@app/lib/api/assistant/conversation/agent_loop";
import { cleanupDeniedBlockedActions } from "@app/lib/api/assistant/conversation/blocked_actions";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import {
  getConversationRankVersionLock,
  getNextConversationMessageRank,
} from "@app/lib/api/assistant/conversation/lock";
import {
  createUserMentions,
  resolveUserMentions,
} from "@app/lib/api/assistant/conversation/mentions";
import type { AgentMessageModelResolution } from "@app/lib/api/assistant/conversation/messages";
import {
  attributeUserFromWorkspaceAndEmail,
  createAgentMessages,
  createUserMessage,
  resolveModelForMentionedAgent,
} from "@app/lib/api/assistant/conversation/messages";
import {
  isAgentRestrictedBySpaceUsage,
  updateConversationRequirements,
} from "@app/lib/api/assistant/conversation/permissions";
import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import { RUNNING_AGENT_SWITCH_BLOCK_MESSAGE } from "@app/lib/api/assistant/errors";
import { isRetiredGlobalAgent } from "@app/lib/api/assistant/global_agents/global_agents";
import {
  batchRenderMessages,
  batchRenderUserMessagesWithoutMentions,
} from "@app/lib/api/assistant/messages";
import {
  getEffectiveWhiteListedProviders,
  isProviderWhitelistedForAuth,
} from "@app/lib/api/assistant/models";
import { enforcePremiumModelLimit } from "@app/lib/api/assistant/premium_model_limit";
import { gracefullyStopAgentLoop } from "@app/lib/api/assistant/pubsub";
import {
  MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR,
  MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR_WINDOW_SECONDS,
  MESSAGE_RATE_LIMIT_PER_ACTOR_PER_MINUTE,
  MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
  makeAgentMentionsRateLimitKeyForWorkspace,
  makeFairUseAwuCreditsRateLimitKeyForUser,
  makeKeyCapRateLimitKey,
  makeMessageRateLimitKeyForWorkspace,
  makeMessageRateLimitKeyForWorkspaceActor,
  makeMessageRateLimitKeyForWorkspaceActorPerHour,
  makeProgrammaticUsageRateLimitKeyForWorkspace,
  makeSidekickMessageRateLimitKeyForWorkspaceActor,
  SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY,
  SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY_ENTERPRISE,
  SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY_WINDOW_SECONDS,
} from "@app/lib/api/assistant/rate_limits";
import {
  publishAgentMessagesEvents,
  publishConversationEvent,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import {
  buildAuditLogTarget,
  deriveAgentTriggerType,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import {
  isApiBlocked,
  isApiKeyBlocked,
  isProgrammaticApiBlocked,
  isUserBlocked,
} from "@app/lib/api/credits/access_control";
import { maybeAutoUpgradeSeat } from "@app/lib/api/credits/auto_seat_upgrade";
import { maybeUpsertFileAttachment } from "@app/lib/api/files/attachments";
import { getRemainingKeyCapMicroUsd } from "@app/lib/api/programmatic_usage/key_cap";
import {
  checkProgrammaticUsageLimits,
  isProgrammaticUsage,
} from "@app/lib/api/programmatic_usage/tracking";
import { fetchLatestProjectContextFileContentFragment } from "@app/lib/api/projects/context";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { isNonCreditPricedUserSpendLimitReached } from "@app/lib/api/users/spend_limit";
import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import { isModelAvailable } from "@app/lib/assistant";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { extractFromString, serializeMention } from "@app/lib/mentions/format";
import { isFreeOrigin } from "@app/lib/metronome/events";
import {
  getWorkspaceCreditPoolStatus,
  getWorkspaceProgrammaticCreditStatus,
} from "@app/lib/metronome/user_block";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { notifyNewProjectConversation } from "@app/lib/notifications/triggers/project-new-conversation";
import { triggerConversationUnreadNotifications } from "@app/lib/notifications/workflows/conversation-unread";
import { isEnterpriseOrDust } from "@app/lib/plans/plan_codes";
import { computeEffectiveMessageLimit } from "@app/lib/plans/usage/limits";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import type { RunningAgentMessageContext } from "@app/lib/resources/conversation_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  getTimeframeSecondsFromLiteral,
  getWeightedRateLimiterCount,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger, { auditLog } from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
} from "@app/types/api/assistant";
import { isContentFragmentInputWithContentNode } from "@app/types/api/assistant";
import type {
  LightAgentConfigurationType,
  ToolErrorEvent,
} from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  AgenticMessageData,
  AgentMessageStatus,
  AgentMessageType,
  AgentMessageTypeWithoutMentions,
  CitationType,
  ConversationMetadata,
  ConversationVisibility,
  ConversationWithoutContentType,
  MessageVisibility,
  RichMentionWithStatus,
  UserMessageContext,
  UserMessageType,
  UserMessageTypeWithoutMentions,
} from "@app/types/assistant/conversation";
import {
  ConversationError,
  isAgentMessageType,
  isPodConversation,
  isUserMessageType,
  isUserMessageWithoutConcreteUser,
  UNRESUMABLE_AGENT_MESSAGE_STATUSES,
} from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";
import {
  isAgentMention,
  isUserMention,
  toMentionType,
} from "@app/types/assistant/mentions";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type {
  ContentFragmentContextType,
  ContentFragmentType,
} from "@app/types/content_fragment";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { isCreditPricedPlan } from "@app/types/plan";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { IncomingHttpHeaders } from "http";
import { col } from "sequelize";

// Rate limit for programmatic usage: 1 message per this amount of dollars per minute.
const PROGRAMMATIC_RATE_LIMIT_DOLLARS_PER_MESSAGE = 3;

// Concurrency limits for pool-credit workspaces based on pool credit state.
// Prevents close-to-0 attacks where many requests are sent simultaneously
// before Metronome debits settle.
const POOL_CREDIT_CONCURRENCY_LIMITS: Record<string, number> = {
  active: 1000,
  active_low_balance: 5,
  active_critical_balance: 1,
};

// Concurrency limits for programmatic API calls based on the workspace
// programmatic monthly cap state. Same shape and intent as the pool limits:
// once the workspace is close to its monthly cap, tighten in-flight
// programmatic requests so concurrent calls can't overshoot before
// Metronome debits settle. `depleted` is handled upstream by
// `isProgrammaticApiBlocked`.
const PROGRAMMATIC_CREDIT_CONCURRENCY_LIMITS: Record<string, number> = {
  active: 1000,
  active_low_balance: 5,
  active_critical_balance: 1,
};

/** Citations and generated files aggregated from source MCP output items (e.g. branch merge). */
export type CitationsAndFilesFromOutputItemsType = {
  citationsAllocated: number;
  outputItems: Array<{
    fileId: ModelId | null;
    citations: Record<string, CitationType> | null;
  }>;
};

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
): Promise<ConversationResource> {
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

  if (isPodConversation(conversationAsJson)) {
    notifyNewProjectConversation(auth, {
      conversation: conversationAsJson,
    });
  }

  return conversation;
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
    await conversation.updateVisibilityToDeleted(auth);
  }

  return new Ok({ success: true });
}

export async function getConversationMessageType(
  auth: Authenticator,
  conversation: ConversationWithoutContentType | ConversationResource,
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

/**
 * Get the mentions from the last user message in a conversation
 */
export async function getLastUserMessageMentions(
  auth: Authenticator,
  conversation: ConversationWithoutContentType | ConversationResource
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

export function isUserMessageContextValid(
  auth: Authenticator,
  headers: IncomingHttpHeaders,
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
  } = headers;

  switch (context.origin) {
    case "api":
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
    case "wakeup":
    case "onboarding_conversation":
    case "agent_sidekick":
    case "project_kickoff":
    case "reinforced_skill_notification":
    case "reinforcement":
    case "system_activation":
    case "web":
      return false;
    default:
      assertNever(context.origin);
  }
}

export async function postUserMessage(
  auth: Authenticator,
  {
    conversationResource,
    content,
    mentions,
    context,
    agenticMessageData,
    skipToolsValidation,
    skipDustAutoMention,
    doNotAssociateUser,
    modelSelection,
  }: {
    conversationResource: ConversationResource;
    content: string;
    mentions: MentionType[];
    context: UserMessageContext;
    agenticMessageData?: AgenticMessageData;
    skipToolsValidation: boolean;
    doNotAssociateUser?: boolean;
    skipDustAutoMention?: boolean;
    modelSelection?: ModelSelectionType;
  }
): Promise<
  Result<
    {
      userMessage: UserMessageType;
      agentMessages: AgentMessageType[];
    },
    APIErrorWithContentfulStatusCode
  >
> {
  const user = auth.user();
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const plan = subscription?.plan;

  const conversation: ConversationWithoutContentType =
    conversationResource.toJSON();

  if (!owner || !subscription || !plan) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(auth);
  const isPartOfPod = isPodConversation(conversation);

  if (isPartOfPod) {
    // Check if the user is a member of the space.
    const pod = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (!pod) {
      return new Err({
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Pod not found",
        },
      });
    }
    // If the Pod is open and there is no user in the context (eg: slack bot message),
    // we allow the message to be posted.
    const skipMembershipCheck =
      !auth.user() &&
      doNotAssociateUser === true &&
      !(await pod.isRestricted(auth));
    if (!skipMembershipCheck && !pod.isMember(auth)) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not a member of the Pod.",
        },
      });
    }
  }

  // Snapshot user-explicit agent mentions before any auto-injection. Steering and
  // visibility decisions downstream depend on user intent, not on server-injected mentions.
  const explicitAgentMentions = mentions.filter(isAgentMention);

  // Auto-inject @dust for mention-less web/extension messages in single-user conversations.
  // Must run before the plan rate-limit check so the resulting agent message is counted.
  // Note: the per-pod default agent is applied client-side via the input bar sticky mention,
  // so the normal pod flow sends an explicit mention and never reaches this backstop.
  if (
    !skipDustAutoMention &&
    mentions.length === 0 &&
    (context.origin === "web" || context.origin === "extension")
  ) {
    const hasOtherHumans =
      await conversationResource.hasUserMessageFromOtherUser(auth, {
        excludeUserId: user?.id,
      });

    if (!hasOtherHumans) {
      const dustAgent = await getAgentConfiguration(auth, {
        agentId: GLOBAL_AGENTS_SID.DUST,
        variant: "extra_light",
      });

      if (dustAgent && dustAgent.status === "active") {
        mentions.push({ configurationId: dustAgent.sId });
        content = `${serializeMention({ id: dustAgent.sId, type: "agent", label: dustAgent.name })} ${content}`;
      }
    }
  }

  // Check plan and rate limit.
  const limitResult = await checkMessagesLimit(auth, { mentions, context });
  if (limitResult.isErr()) {
    return limitResult;
  }

  // Block posting until GCS files have been copied into the child conversation.
  if (conversation.forkingData?.forkedFrom?.fileCopyStatus === "pending") {
    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message:
          "User messages cannot be posted while the forked conversation is being prepared.",
      },
    });
  }

  // Block posting while compaction is in progress, for now. It's not too hard to add support for
  // pending messages on top of compaction. We start without support for it to simplify. Note that
  // we don't currently re-check the existence of a compaction message inside the critical section
  // below which means an agent loop could be triggered whle a compaction is running. This is not
  // that problematic if it happens (agent message after the compaction message).
  const { runningAgentMessage: runningAgentContext, runningCompactionMessage } =
    await conversationResource.getInFlightMessages(auth);
  if (runningCompactionMessage) {
    return new Err({
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message:
          "User messages cannot be posted while conversation is being compacted.",
      },
    });
  }

  const canInteractRes = await WakeUpResource.canUserInteract(
    auth,
    conversation
  );
  if (canInteractRes.isErr()) {
    return canInteractRes;
  }

  let runningAgentMessage: RunningAgentMessageContext | undefined =
    runningAgentContext ?? undefined;

  // Steering invariants: enforce single agent loop per conversation.
  if (explicitAgentMentions.length > 1) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only one agent can be mentioned per message.",
      },
    });
  }

  // When isHandover is true we allow creating a new agentic loop as the parent one will close asap,
  // the steering code path is disabled in that case: we allow mentioning another agent (the agent
  // to handoff to) and we don't set the user message state to pending (see below).
  const isHandover = agenticMessageData?.type === "agent_handover";

  if (
    runningAgentMessage &&
    explicitAgentMentions.length > 0 &&
    explicitAgentMentions[0].configurationId !==
      runningAgentMessage.agentConfigurationId &&
    !isHandover
  ) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: RUNNING_AGENT_SWITCH_BLOCK_MESSAGE,
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
      variant: "extra_light",
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

  let agentConfigurations = removeNulls(results[0]);

  // Retired global agents can't be invoked (new conversations or new messages).
  // The internal `run_agent` path is exempt: some hidden sub-agents are retired.
  const isInternalRunAgent = agenticMessageData?.type === "run_agent";

  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);

  for (const agentConfig of agentConfigurations) {
    if (!isInternalRunAgent && isRetiredGlobalAgent(agentConfig.sId)) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "agent_inaccessible",
          message: `Assistant ${agentConfig.name} is retired and can no longer be used.`,
        },
      });
    }

    if (!canAccessAgent(agentConfig)) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "agent_inaccessible",
          message:
            "This agent is either disabled or you don't have access to it.",
        },
      });
    }

    const isProviderEnabled = isProviderWhitelistedForAuth(
      auth,
      agentConfig.model.providerId,
      whiteListedProviders
    );
    if (!isProviderEnabled) {
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

    const supportedModelConfig = getSupportedModelConfig(agentConfig.model);
    if (
      !supportedModelConfig ||
      !(
        isModelStreamId(supportedModelConfig.modelId) ||
        isModelAvailable(supportedModelConfig, {
          featureFlags,
          plan,
          regionalModelsOnly: owner.regionalModelsOnly,
          region: regionConfig.getCurrentRegion(),
        })
      )
    ) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The model is not supported.",
          model: agentConfig.model,
        },
      });
    }
  }

  // TODO(2026-07-31 SEC): this allow spoofing as we trust blindly the user email from the metadata.
  let messageUser = doNotAssociateUser ? null : (user?.toJSON() ?? null);
  messageUser ??= await attributeUserFromWorkspaceAndEmail(
    owner,
    context.email
  );

  const resolvedUserMentions = await resolveUserMentions(auth, {
    mentions,
    conversation,
    message: { type: "user_message" },
  });

  const mentionedAgentConfiguration = agentConfigurations[0] ?? null;
  const mentionedAgentRestricted = await isAgentRestrictedBySpaceUsage(auth, {
    configuration: mentionedAgentConfiguration,
    conversation,
  });
  let modelResolution = mentionedAgentConfiguration
    ? await resolveModelForMentionedAgent(auth, {
        configuration: mentionedAgentConfiguration,
        selection: modelSelection,
      })
    : null;

  if (user && modelResolution) {
    const premiumLimitResult = await enforcePremiumModelLimit(auth, {
      user,
      resolution: modelResolution,
      context,
    });
    if (premiumLimitResult.isErr()) {
      return premiumLimitResult;
    }
    modelResolution = premiumLimitResult.value;
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

    let nextMessageRank = await getNextConversationMessageRank(auth, {
      conversation,
      transaction: t,
    });

    // Enrich context with auth data for analytics tracking. When an attribution
    // key is set (internal system-key calls like run_agent forward the original
    // caller's key name), attribute usage to it instead of the request's own key;
    // this drives api_key_name in usage analytics without affecting authorization.
    const enrichedContext: UserMessageContext = {
      ...context,
      apiKeyId: auth.attributionKeyModelId() ?? auth.key()?.id ?? null,
      authMethod: auth.authMethod(),
    };

    // Re-read the agent message status inside the critical section of the advisory lock. Between
    // the initial check and acquiring the lock, the agent loop may have finalized — if so, clear
    // runningAgentMessage so we fall through to the normal flow.
    if (runningAgentMessage) {
      const agentMessageRow = await AgentMessageModel.findOne({
        where: {
          id: runningAgentMessage.agentMessageId,
          workspaceId: owner.id,
        },
        transaction: t,
      });

      if (agentMessageRow?.status !== "created") {
        runningAgentMessage = undefined;
      }
    }

    // We set the visibility of the user message to "pending" if steering is enabled, we have a
    // running agent message and there are agent mentions in the user messsage. If we are handing
    // over we don't attempt steering as the intent is to start a new agentic loop and stop the
    // parent one ASAP.
    const visibility: MessageVisibility =
      runningAgentMessage && explicitAgentMentions.length > 0 && !isHandover
        ? "pending"
        : "visible";

    // Return the user message without mentions.
    // This way typescript forces us to create the mentions after the user message is created.
    const userMessageWithoutMentions = await createUserMessage(auth, {
      conversation,
      content,
      metadata: {
        type: "create",
        user: messageUser,
        rank: nextMessageRank++,
        context: enrichedContext,
        agenticMessageData,
        visibility,
        requestedModel: modelSelection ?? null,
      },
      transaction: t,
    });

    const richMentions = await createUserMentions(auth, {
      resolvedMentions: resolvedUserMentions,
      message: userMessageWithoutMentions,
      conversation,
      transaction: t,
    });

    await ConversationResource.markAsUpdated(auth, { conversation, t });

    if (!doNotAssociateUser) {
      // Mark the conversation as read for the current user.
      await ConversationResource.markAsReadForAuthUser(auth, {
        conversation,
        transaction: t,
      });
    }

    if (visibility === "pending") {
      // Pending path: agent is still running, and we have agent mentions, create a pending user
      // message without an agent message.
      const userMessage = {
        ...userMessageWithoutMentions,
        richMentions,
        mentions: richMentions.map(toMentionType),
      };

      return { userMessage, agentMessages: [] };
    } else {
      // Normal path: create agent messages for all mentioned agents, and associate them with the
      // user message.
      const { agentMessages, richMentions: agentRichMentions } =
        await createAgentMessages(auth, {
          conversation,
          metadata: {
            type: "create",
            agentConfiguration: mentionedAgentConfiguration,
            skipToolsValidation,
            nextMessageRank,
            userMessage: userMessageWithoutMentions,
            modelResolution,
            isRestrictedBySpaceUsage: mentionedAgentRestricted,
          },
          transaction: t,
        });

      richMentions.push(...agentRichMentions);

      const userMessage = {
        ...userMessageWithoutMentions,
        richMentions: richMentions,
        mentions: richMentions.map(toMentionType),
      };

      return {
        userMessage,
        agentMessages,
      };
    }
  });

  // If a user is mentioned, we want to make sure the conversation has a title.
  // This ensures that mentioned users receive a notification with a conversation title.
  if (mentions.some(isUserMention)) {
    await ensureConversationTitle(auth, { conversation });
  }

  await triggerConversationUnreadNotifications(auth, {
    conversationId: conversation.sId,
    messageId: userMessage.sId,
  });

  void ServerSideTracking.trackUserMessage({
    userMessage,
    workspace: owner,
    userId: user ? `user-${user.id}` : `api-${context.username}`,
    conversationId: conversation.sId,
    agentMessages,
  });

  // Run-correlation and lineage fields shared by every agent invoked by this
  // user message. `agentMessage.sId` is the durable run id (1:1 with an agent
  // execution); sub-agent runs (run_agent / handover) carry the parent agent
  // message id via `agenticMessageData` (the function parameter).
  const triggerType = deriveAgentTriggerType(
    agenticMessageData,
    conversation.triggerId
  );

  // Emit agent.executed for each agent being invoked.
  for (const agentMessage of agentMessages) {
    void emitAuditLogEvent({
      auth,
      action: "agent.executed",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("agent", agentMessage.configuration),
      ],
      metadata: {
        conversation_id: conversation.sId,
        agent_name: agentMessage.configuration.name,
        agent_message_id: agentMessage.sId,
        origin: context.origin,
        trigger_type: triggerType,
        depth: String(conversation.depth),
        ...(conversation.triggerId
          ? { trigger_id: conversation.triggerId }
          : {}),
        ...(agenticMessageData
          ? { parent_agent_message_id: agenticMessageData.originMessageId }
          : {}),
        initiating_user_id: auth.user()?.sId ?? "unknown",
        initiating_user_email: auth.user()?.email ?? "unknown",
      },
    });
  }

  // Run agent loop workflows after the transaction commits, to ensure messages are persisted.
  if (agentMessages.length > 0) {
    await runAgentLoopWorkflow({
      auth,
      agentMessages,
      conversation,
      userMessage,
    });
  } else if (runningAgentMessage && userMessage.visibility === "pending") {
    // Pending path: signal the running agent loop to gracefully stop.
    await gracefullyStopAgentLoop(auth, {
      messageIds: [runningAgentMessage.sId],
      conversationId: conversation.sId,
    });
  }

  await Promise.all([
    publishMessageEventsOnMessagePostOrEdit(
      conversation,
      {
        ...userMessage,
        contentFragments: await fetchPrecedingContentFragments(auth, {
          conversationResource,
          targetRank: userMessage.rank,
        }),
      },
      agentMessages
    ),
    // If the conversation did not have any agent messages yet, we might not have a title, this ensure we generate one.
    // Doing after 3 messages to avoid generating a title too early.
    userMessage.rank >= 3
      ? ensureConversationTitle(auth, {
          conversation,
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

// A message with no concrete user has no author to be, so nobody passes this.
// Testing that first also stops an API key, which has no `auth.user()` either,
// from matching null against null.
function isUserMessageAuthor(
  auth: Authenticator,
  message: UserMessageType
): boolean {
  if (isUserMessageWithoutConcreteUser(message)) {
    return false;
  }

  return auth.user()?.id === message.user?.id;
}

/**
 * This method creates a new user message version. If a new message contains agent mentions, it will create new agent messages,
 * only when there are no agent messages after the edited user message.
 */
export async function editUserMessage(
  auth: Authenticator,
  {
    conversationResource,
    message,
    content,
    mentions,
    skipToolsValidation,
  }: {
    conversationResource: ConversationResource;
    message: UserMessageType;
    content: string;
    mentions: MentionType[];
    skipToolsValidation: boolean;
  }
): Promise<
  Result<
    { userMessage: UserMessageType; agentMessages: AgentMessageType[] },
    APIErrorWithContentfulStatusCode
  >
> {
  const user = auth.user();
  const owner = auth.workspace();

  if (!owner) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    });
  }

  if (!isUserMessageAuthor(auth, message)) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only the author of the message can edit it",
      },
    });
  }

  const conversation: ConversationWithoutContentType =
    conversationResource.toJSON();

  const canInteractRes = await WakeUpResource.canUserInteract(
    auth,
    conversation
  );
  if (canInteractRes.isErr()) {
    return canInteractRes;
  }

  const editLimitResult = await checkMessagesLimit(auth, {
    mentions,
    context: message.context,
  });
  if (editLimitResult.isErr()) {
    return editLimitResult;
  }

  let userMessage: UserMessageType | null = null;
  let agentMessages: AgentMessageType[] = [];

  const results = await Promise.all([
    getAgentConfigurations(auth, {
      agentIds: mentions
        .filter(isAgentMention)
        .map((mention) => mention.configurationId),
      variant: "light",
    }),
    ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: user?.toJSON() ?? null,
    }),
  ]);

  const agentConfigurations = results[0];

  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);

  for (const agentConfig of agentConfigurations) {
    if (!canAccessAgent(agentConfig)) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "agent_inaccessible",
          message:
            "This agent is either disabled or you don't have access to it.",
        },
      });
    }

    const isProviderEnabled = isProviderWhitelistedForAuth(
      auth,
      agentConfig.model.providerId,
      whiteListedProviders
    );
    if (!isProviderEnabled) {
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

  const resolvedUserMentions = await resolveUserMentions(auth, {
    mentions,
    conversation,
    message: { type: "user_message" },
  });

  const mentionedAgentConfiguration = agentConfigurations[0] ?? null;

  const mentionedAgentRestricted = await isAgentRestrictedBySpaceUsage(auth, {
    configuration: mentionedAgentConfiguration,
    conversation,
  });

  let modelResolution = mentionedAgentConfiguration
    ? await resolveModelForMentionedAgent(auth, {
        configuration: mentionedAgentConfiguration,
        selection: message.requestedModel ?? undefined,
      })
    : null;

  if (user && modelResolution) {
    const premiumLimitResult = await enforcePremiumModelLimit(auth, {
      user,
      resolution: modelResolution,
      context: message.context,
    });
    if (premiumLimitResult.isErr()) {
      return premiumLimitResult;
    }
    modelResolution = premiumLimitResult.value;
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
        resolvedMentions: resolvedUserMentions,
        message: userMessageWithoutMentions,
        conversation,
        transaction: t,
      });

      const hasAgentMentions = mentions.some(isAgentMention);

      if (hasAgentMentions) {
        const hasAgentMessagesAfter =
          await conversationResource.hasAgentMessageAfterRank(auth, {
            afterRank: messageRow.rank,
            transaction: t,
          });

        const agentMessages: AgentMessageType[] = [];

        // Only create agent messages if there are no agent messages after the edited user message
        if (!hasAgentMessagesAfter) {
          const nextMessageRank = await getNextConversationMessageRank(auth, {
            conversation,
            transaction: t,
          });

          const {
            agentMessages: newAgentMessages,
            richMentions: agentRichMentions,
          } = await createAgentMessages(auth, {
            conversation,
            metadata: {
              type: "create",
              agentConfiguration: mentionedAgentConfiguration,
              skipToolsValidation,
              nextMessageRank,
              userMessage: userMessageWithoutMentions,
              modelResolution,
              isRestrictedBySpaceUsage: mentionedAgentRestricted,
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
      contentFragments: await fetchPrecedingContentFragments(auth, {
        conversationResource,
        targetRank: userMessage.rank,
      }),
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
    const resolvedUserMentions = await resolveUserMentions(auth, {
      mentions: userMentions,
      conversation,
      message: agentMessage,
    });

    await withTransaction(async (t) => {
      richMentions.push(
        ...(await createUserMentions(auth, {
          resolvedMentions: resolvedUserMentions,
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

export async function createAgentMessageFromText(
  auth: Authenticator,
  {
    conversation,
    parentId,
    rank,
    content,
    agentConfiguration,
    skipToolsValidation = true,
    citationsAndFilesFromOutputItems,
  }: {
    conversation: ConversationWithoutContentType;
    parentId: ModelId;
    rank: number;
    content: string;
    agentConfiguration: { sId: string; version: number };
    skipToolsValidation?: boolean;
    citationsAndFilesFromOutputItems?: CitationsAndFilesFromOutputItemsType;
  }
): Promise<{
  messageModelId: ModelId;
  messageId: string;
  agentMessageModelId: ModelId;
}> {
  const owner = auth.getNonNullableWorkspace();

  const created = await withTransaction(async (t) => {
    const agentMessageRow = await AgentMessageModel.create(
      {
        status: "succeeded",
        agentConfigurationId: agentConfiguration.sId,
        agentConfigurationVersion: agentConfiguration.version,
        conversationId: conversation.id,
        workspaceId: owner.id,
        skipToolsValidation,
        runIds: null,
        completedAt: new Date(),
        modelInteractionDurationMs: 0,
        prunedContext: false,
        errorCode: null,
        errorMessage: null,
        errorMetadata: null,
      },
      { transaction: t }
    );

    const messageRow = await MessageModel.create(
      {
        sId: generateRandomModelSId(),
        rank,
        conversationId: conversation.id,
        parentId,
        agentMessageId: agentMessageRow.id,
        workspaceId: owner.id,
      },
      { transaction: t }
    );

    await AgentStepContentModel.create(
      {
        workspaceId: owner.id,
        agentMessageId: agentMessageRow.id,
        step: 0,
        index: 0,
        version: 0,
        type: "text_content",
        value: { type: "text_content", value: content },
      },
      { transaction: t }
    );

    if (citationsAndFilesFromOutputItems) {
      const { citationsAllocated, outputItems } =
        citationsAndFilesFromOutputItems;

      const functionCallStepContent = await AgentStepContentModel.create(
        {
          workspaceId: owner.id,
          agentMessageId: agentMessageRow.id,
          step: 0,
          index: 1,
          version: 0,
          type: "function_call",
          value: {
            type: "function_call",
            value: {
              id: `merged_output_${messageRow.id}`,
              name: "merged_output",
              arguments: "{}",
            },
          },
        },
        { transaction: t }
      );

      const createdAction = await AgentMCPActionModel.create(
        {
          workspaceId: owner.id,
          mcpServerConfigurationId: "",
          agentMessageId: agentMessageRow.id,
          status: "succeeded",
          citationsAllocated,
          augmentedInputs: {},
          toolConfiguration: {} as LightMCPToolConfigurationType,
          stepContext: {} as StepContext,
          executionDurationMs: null,
        },
        { transaction: t }
      );

      await AgentStepContentToolExecutionModel.create(
        {
          workspaceId: owner.id,
          conversationId: conversation.id,
          agentMessageId: agentMessageRow.id,
          agentMCPActionId: createdAction.id,
          stepContentId: functionCallStepContent.id,
        },
        { transaction: t }
      );

      if (outputItems.length > 0) {
        const syntheticMcpOutputContent: CallToolResult["content"][number] = {
          type: "text",
          text: "",
        };
        await AgentMCPActionOutputItemModel.bulkCreate(
          outputItems.map((oi) => ({
            workspaceId: owner.id,
            agentMCPActionId: createdAction.id,
            content: syntheticMcpOutputContent,
            contentGcsPath: null,
            fileId: oi.fileId,
            citations: oi.citations,
          })),
          { transaction: t }
        );
      }
    }

    return {
      messageModelId: messageRow.id,
      messageId: messageRow.sId,
      agentMessageModelId: agentMessageRow.id,
    };
  });

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    logger.error(
      {
        workspaceId: owner.sId,
        conversationId: conversation.sId,
        messageId: created.messageId,
      },
      "createAgentMessageFromText: conversation not found for event publish."
    );
    return created;
  }

  const messageRow = await MessageModel.findOne({
    where: { id: created.messageModelId, workspaceId: owner.id },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!messageRow?.agentMessage) {
    logger.error(
      {
        workspaceId: owner.sId,
        conversationId: conversation.sId,
        messageId: created.messageId,
      },
      "createAgentMessageFromText: message row missing for batch render."
    );
    return created;
  }

  const renderedRes = await batchRenderMessages(
    auth,
    conversationResource,
    [messageRow],
    "full"
  );

  if (renderedRes.isErr()) {
    logger.error(
      {
        workspaceId: owner.sId,
        conversationId: conversation.sId,
        messageId: created.messageId,
        error: renderedRes.error,
      },
      "createAgentMessageFromText: batchRenderMessages failed."
    );
    return created;
  }

  const agentMessage = renderedRes.value.find(
    (m): m is AgentMessageType =>
      isAgentMessageType(m) && m.sId === created.messageId
  );

  if (!agentMessage) {
    logger.error(
      {
        workspaceId: owner.sId,
        conversationId: conversation.sId,
        messageId: created.messageId,
      },
      "createAgentMessageFromText: rendered agent message not found."
    );
    return created;
  }

  await publishAgentMessagesEvents(conversation, [agentMessage]);

  return created;
}

// This method is in charge of re-running an agent interaction (generating a new
// AgentMessage as a result)
export async function retryAgentMessage(
  auth: Authenticator,
  {
    conversationResource,
    message,
  }: {
    conversationResource: ConversationResource;
    message: AgentMessageType;
  }
): Promise<Result<AgentMessageType, APIErrorWithContentfulStatusCode>> {
  const conversation: ConversationWithoutContentType =
    conversationResource.toJSON();

  const parentMessageRes = await conversationResource.getMessageById(
    auth,
    message.parentMessageId
  );
  if (parentMessageRes.isErr() || !parentMessageRes.value.userMessage) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not find the parent user message for this retry.",
      },
    });
  }

  const latestParentMessageModel =
    await conversationResource.getLatestUserMessageModelAtRank(auth, {
      rank: parentMessageRes.value.rank,
    });
  if (!latestParentMessageModel) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not find the parent user message for this retry.",
      },
    });
  }

  const parentUserMessageRenderRes = await batchRenderMessages(
    auth,
    conversationResource,
    [latestParentMessageModel],
    "full"
  );
  if (parentUserMessageRenderRes.isErr()) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not find the parent user message for this retry.",
      },
    });
  }

  const parentUserMessage = parentUserMessageRenderRes.value[0];
  if (!parentUserMessage || !isUserMessageType(parentUserMessage)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not find the parent user message for this retry.",
      },
    });
  }

  // Retrying would replay the parent's server-set origin, which can carry free
  // usage.
  if (isUserMessageWithoutConcreteUser(parentUserMessage)) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The answer to a message posted by Dust cannot be retried.",
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

  let retryModelResolution: AgentMessageModelResolution = message.resolvedModel
    ? {
        resolvedModel: message.resolvedModel,
        modelResolutionMethod: message.modelResolutionMethod ?? "agent",
      }
    : await resolveModelForMentionedAgent(auth, {
        configuration: message.configuration,
      });

  const user = auth.user();
  if (user) {
    const premiumLimitResult = await enforcePremiumModelLimit(auth, {
      user,
      resolution: retryModelResolution,
      context: parentUserMessage.context,
    });
    if (premiumLimitResult.isErr()) {
      return premiumLimitResult;
    }
    retryModelResolution = premiumLimitResult.value;
  }

  const retryAgentConfiguration = await getAgentConfiguration(auth, {
    agentId: message.configuration.sId,
    variant: "extra_light",
  });
  if (!retryAgentConfiguration || !canAccessAgent(retryAgentConfiguration)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid agent message retry request, the agent is no longer available to you.",
      },
    });
  }

  // Restricted-space agents may already exist in a Pod conversation after the
  // user approved the mention. Retry must not re-apply canAgentBeUsedInProjectConversation.

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

      const { agentMessages } = await createAgentMessages(auth, {
        conversation,
        metadata: {
          type: "retry",
          parentId: messageRow.parentId,
          agentMessage: message,
          agentMessageRow: messageRow.agentMessage,
          modelResolution: retryModelResolution,
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

  void launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: parentUserMessage.sId,
      userMessageVersion: parentUserMessage.version,
      userMessageOrigin: parentUserMessage.context.origin,
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
  conversation: ConversationWithoutContentType,
  cf: ContentFragmentInputWithFileIdType | ContentFragmentInputWithContentNode,
  context: ContentFragmentContextType | null
): Promise<Result<ContentFragmentType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Invalid auth for conversation.");
  }
  if (
    (await ConversationResource.canAccess(auth, conversation.sId)) !== "allowed"
  ) {
    return new Err(new Error("Conversation access restricted."));
  }

  // Project conversations only allow content fragments from the project space or the global space.
  if (
    isPodConversation(conversation) &&
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

  // If the user attaches a project-context file to a project conversation, reuse the existing
  // project content fragment and only create the message row at send time.
  if (isPodConversation(conversation) && "fileId" in cf) {
    const project = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (project?.isProject()) {
      const r = await fetchLatestProjectContextFileContentFragment(
        auth,
        project,
        cf.fileId
      );
      if (r) {
        const alreadyPresent =
          await ConversationResource.hasMessageForContentFragmentSeries(auth, {
            conversation,
            contentFragmentId: r.fragment.sId,
            contentFragmentVersion: "latest",
          });

        if (!alreadyPresent) {
          await withTransaction(async (t) => {
            await getConversationRankVersionLock(auth, conversation, t);

            const nextMessageRank = await getNextConversationMessageRank(auth, {
              conversation,
              transaction: t,
            });

            await MessageModel.create(
              {
                sId: generateRandomModelSId(),
                rank: nextMessageRank,
                conversationId: conversation.id,
                contentFragmentId: r.fragment.id,
                workspaceId: owner.id,
              },
              { transaction: t }
            );

            await ConversationResource.markAsUpdated(auth, { conversation, t });
          });
        }

        const rendered =
          await ContentFragmentResource.renderToContentFragmentType(
            auth,
            r.fragment,
            { kind: "project_context", file: r.file }
          );
        return new Ok(rendered);
      }
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
    const found = await ConversationResource.hasMessageForContentFragmentSeries(
      auth,
      {
        conversation,
        contentFragmentId: supersededContentFragmentId,
      }
    );

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
      conversationId: conversation.id,
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

    const nextMessageRank = await getNextConversationMessageRank(auth, {
      conversation,
      transaction: t,
    });
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
        contentFragmentDatasourceViewIds: [cf.nodeDataSourceViewId],
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

/**
 * Soft-delete a user message and the agent replies that followed it.
 *
 * Both deletions are represented as new v+1 `messages` rows with `visibility: "deleted"` rather
 * than UPDATEs on the v0 rows. This is required so other clients viewing the conversation see the
 * deletion in realtime: the message event stream fires on new rows (publishAgentMessagesEvents /
 * publishMessageEventsOnMessagePostOrEdit), not on UPDATEs. As a side benefit, v0 stays intact as
 * immutable history.
 *
 * The cascade to the following agent replies is necessary because otherwise the orphaned agent
 * messages would be rendered for the model with no preceding user turn, producing a trailing
 * assistant turn that providers like Anthropic reject (400 invalid_request_error).
 */
export async function softDeleteUserMessageAndReplies(
  auth: Authenticator,
  {
    message,
    conversationResource,
  }: {
    message: UserMessageType;
    conversationResource: ConversationResource;
  }
): Promise<Result<{ success: true }, ConversationError>> {
  if (message.visibility === "deleted") {
    return new Ok({ success: true });
  }

  const conversation: ConversationWithoutContentType =
    conversationResource.toJSON();

  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  // Only admins or the user who sent the message can delete it.
  if (!auth.isAdmin() && message.user?.id !== user.id) {
    return new Err(new ConversationError("message_deletion_not_authorized"));
  }

  // Known small race: this snapshot is taken before the rank lock below. A concurrent retry/edit
  // that takes the lock first and writes a v+1 at the same rank could cause the cascade insert to
  // hit the (rank, version) unique constraint.
  const orphanAgentMessageModels =
    await conversationResource.getConsecutiveAgentReplyModelsAfterRank(auth, {
      afterRank: message.rank,
    });

  const orphanModelsToCascade = orphanAgentMessageModels.filter(
    (m) => m.visibility !== "deleted"
  );

  let orphanAgentMessages: AgentMessageType[] = [];
  if (orphanModelsToCascade.length > 0) {
    const orphanRenderRes = await batchRenderMessages(
      auth,
      conversationResource,
      orphanModelsToCascade,
      "full"
    );
    if (orphanRenderRes.isErr()) {
      throw new Error("Failed to render agent replies to cascade on delete");
    }
    orphanAgentMessages = orphanRenderRes.value.filter(isAgentMessageType);
  }

  const cascadedAgentMessages: AgentMessageType[] = [];
  const userMessage = await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    const relatedContentFragments = await fetchPrecedingContentFragments(auth, {
      conversationResource,
      targetRank: message.rank,
      transaction: t,
    });

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

    for (const orphan of orphanAgentMessages) {
      const { agentMessages } = await createAgentMessages(auth, {
        conversation,
        metadata: {
          type: "delete",
          agentMessage: orphan,
          parentId: message.id,
        },
        transaction: t,
      });
      cascadedAgentMessages.push(...agentMessages);
    }

    await ConversationResource.markAsUpdated(auth, { conversation, t });

    return userMessage;
  });

  await publishMessageEventsOnMessagePostOrEdit(
    conversation,
    { ...userMessage, contentFragments: [], mentions: [], richMentions: [] },
    []
  );

  if (cascadedAgentMessages.length > 0) {
    await publishAgentMessagesEvents(conversation, cascadedAgentMessages);
  }

  // Signal any still-running agent loops to stop. Orphans with status "created" have a live
  // Temporal workflow that would otherwise keep streaming to a deleted message. The gracefully-
  // stopped event also lets the client flip the message status and hide the Stop button.
  const runningOrphans = orphanAgentMessages.filter(
    (m) => m.status === "created"
  );
  if (runningOrphans.length > 0) {
    await gracefullyStopAgentLoop(auth, {
      messageIds: runningOrphans.map((m) => m.sId),
      conversationId: conversation.sId,
    });
  }

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

/**
 * Soft-delete a single agent message.
 *
 * See {@link softDeleteUserMessageAndReplies} for the rationale of the v+1 placeholder pattern
 * (realtime sync + immutable history).
 */
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

  // Stop the underlying agent loop if it's still running so the Temporal workflow doesn't keep
  // streaming to a deleted message and the client sees the Stop button disappear.
  if (message.status === "created") {
    await gracefullyStopAgentLoop(auth, {
      messageIds: [message.sId],
      conversationId: conversation.sId,
    });
  }

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
  limitType:
    | "rate_limit_error"
    | "plan_message_limit_exceeded"
    | "credits_exhausted"
    | null;
  message?: string;
}

function getMessageLimitErrorMessage({
  limitType,
  message,
}: {
  limitType: NonNullable<MessageLimit["limitType"]>;
  message?: string;
}): string {
  if (message) {
    return message;
  }

  switch (limitType) {
    case "plan_message_limit_exceeded":
      return "The message limit for this plan has been exceeded.";
    case "credits_exhausted":
      return "Your workspace has run out of credits. Please purchase more credits to continue.";
    case "rate_limit_error":
      return "Rate limit exceeded. Please retry later.";
  }
}

export async function checkMessagesLimit(
  auth: Authenticator,
  {
    mentions,
    context,
  }: {
    mentions: MentionType[];
    context: UserMessageContext;
  }
): Promise<Result<void, APIErrorWithContentfulStatusCode>> {
  // Skip rate limiting for system-initiated messages (e.g. reinforced agent workflows).
  if (!auth.user() && !auth.key() && auth.authMethod() === "internal") {
    return new Ok(undefined);
  }

  // The "agent_sidekick" origin is the builder assistant: an interactive UI
  // feature backed by free (unbilled) usage. Gate it here (so post, edit, and
  // retry are all covered):
  //   1. API keys can't use it — it's UI/session only, never programmatic.
  //   2. It may only target the sidekick global agent — any other target would
  //      let a caller run a real agent for free (the sidekick agent runs its
  //      target via the run_agent tool, not a user-message mention).
  //   3. It's capped per actor to bound how much free usage a single user can
  //      generate through the assistant.
  if (context.origin === "agent_sidekick") {
    if (auth.isKey()) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          apiKeyId: auth.key()?.id,
        },
        "agent_sidekick origin used with API key auth; rejecting."
      );
      return new Err({
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "The agent_sidekick origin is only available to interactive users.",
        },
      });
    }

    const sidekickAgentMentions = mentions.filter(isAgentMention);
    if (
      sidekickAgentMentions.some(
        (mention) => mention.configurationId !== GLOBAL_AGENTS_SID.SIDEKICK
      )
    ) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          userId: auth.user()?.sId,
          mentionedAgentIds: sidekickAgentMentions.map(
            (m) => m.configurationId
          ),
        },
        "Message with agent_sidekick origin targets a non-sidekick agent; refusing to bill it as free."
      );
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The agent_sidekick origin can only target the sidekick agent.",
        },
      });
    }

    const sidekickDailyLimit = isEnterpriseOrDust(auth.plan())
      ? SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY_ENTERPRISE
      : SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY;
    const remaining = await rateLimiter({
      key: makeSidekickMessageRateLimitKeyForWorkspaceActor(
        auth.getNonNullableWorkspace(),
        getMessageRateLimitActor(auth)
      ),
      maxPerTimeframe: sidekickDailyLimit,
      timeframeSeconds:
        SIDEKICK_MESSAGE_RATE_LIMIT_PER_ACTOR_PER_DAY_WINDOW_SECONDS,
      logger,
    });
    if (remaining <= 0) {
      return new Err({
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message: `You have reached the sidekick usage limit (${sidekickDailyLimit} messages per 24h). Please try again later.`,
        },
      });
    }
  }

  // Credit-state + programmatic rate-limit gate. Two systems coexist:
  // - Credit-priced (Metronome) plans: workspace pool + per-user cap, cached in Redis.
  //   For API calls (no user), only the workspace pool applies via `isApiBlocked`.
  //   Pool-balance concurrency limiting (`checkPoolCreditConcurrencyLimit`) prevents
  //   close-to-0 attacks where many requests overshoot the pool before debits settle.
  // - Legacy plans: a per-user credit limit checked from the Redis fixed-window
  //   counter (`isNonCreditPricedUserSpendLimitReached`), plus programmatic credits
  //   checked via `checkProgrammaticUsageLimits` and a credit-balance-scaled
  //   pre-emptive rate limit (`checkProgrammaticUsageRateLimit`).
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.subscription()?.plan;
  const user = auth.user();
  const isCreditPricedWorkspace = Boolean(
    owner.metronomeCustomerId && plan && isCreditPricedPlan(plan)
  );

  if (isCreditPricedWorkspace) {
    // `isUserBlocked` / `isApiBlocked` are flag-aware: with the rate-cap flag on
    // the per-user cap comes from the Redis fixed-window counters, with it off
    // from the Metronome credit state (see `user_block.ts`).
    const blockedReason = user
      ? await isUserBlocked(auth, user)
      : (await isApiBlocked(auth))
        ? ("credits_exhausted" as const)
        : null;
    if (blockedReason === "no_seat") {
      // If the workspace opted into auto-upgrades, try to assign a seat
      // (none → workspace) so the member can proceed with this very message.
      // We await the result (it no-ops unless eligible): on success the user
      // is no longer seat-less, so we fall through instead of rejecting a
      // message we just unblocked.
      if (user) {
        const upgrade = await maybeAutoUpgradeSeat({
          workspaceId: owner.sId,
          userId: user.sId,
        });
        if (upgrade.isOk() && upgrade.value.upgraded) {
          return new Ok(undefined);
        }
      }
      return new Err({
        status_code: 403,
        api_error: {
          type: "no_seat",
          message:
            "You don't have a seat in this workspace. Contact your admin to be assigned one.",
        },
      });
    }
    // Free origins (e.g. Sidekick) produce only free, non-billable usage, so
    // the credit-state caps and pool-balance concurrency limit don't apply — a
    // capped user or a credit-exhausted workspace can still use them. The
    // `no_seat` gate above is intentionally left outside this exemption since
    // it reflects membership, not credit state.
    if (!isFreeOrigin(context.origin)) {
      if (blockedReason === "user_cap_reached") {
        return new Err({
          status_code: 403,
          api_error: {
            type: "user_cap_reached",
            message: "You have reached your personal usage cap.",
          },
        });
      }
      if (blockedReason === "credits_exhausted") {
        return new Err({
          status_code: 403,
          api_error: {
            type: "credits_exhausted",
            message: "Your workspace has run out of credits.",
          },
        });
      }

      // Pre-emptive concurrency limit based on pool credit state. Prevents
      // close-to-0 attacks where many requests are sent simultaneously before
      // Metronome debits settle.
      const poolLimit = await checkPoolCreditConcurrencyLimit(auth);
      if (poolLimit.isLimitReached && poolLimit.limitType) {
        return new Err({
          status_code: 429,
          api_error: {
            type: poolLimit.limitType,
            message: getMessageLimitErrorMessage({
              limitType: poolLimit.limitType,
              message: poolLimit.message,
            }),
          },
        });
      }
    }

    // Programmatic monthly cap: block programmatic calls when the cap is reached.
    if (isProgrammaticUsage(auth, { userMessageOrigin: context.origin })) {
      // Per-API-key credit cap. `isApiKeyBlocked` is flag-aware (rate-limiter
      // counter when the flag is on, Metronome per-key credit state otherwise).
      const key = auth.key();
      if (key) {
        if (await isApiKeyBlocked(auth, { keyModelId: key.id })) {
          return new Err({
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message:
                "This API key has reached its credit spend limit. Please increase the limit in the Developers > API Keys section of the Dust dashboard.",
            },
          });
        }
      }

      // Workspace programmatic monthly cap. `isProgrammaticApiBlocked` is
      // flag-aware (rate-limiter counter when the flag is on, Metronome
      // programmatic credit state otherwise).
      if (await isProgrammaticApiBlocked(auth)) {
        return new Err({
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message:
              "Your workspace has reached its programmatic monthly spending cap. An admin can raise the cap in the workspace's usage settings.",
          },
        });
      }

      // Pre-emptive concurrency limit based on the programmatic monthly cap
      // state. Same close-to-0 defense as the pool concurrency limit above,
      // but scoped to programmatic API traffic.
      const programmaticLimit =
        await checkProgrammaticCreditConcurrencyLimit(auth);
      if (programmaticLimit.isLimitReached && programmaticLimit.limitType) {
        return new Err({
          status_code: 429,
          api_error: {
            type: programmaticLimit.limitType,
            message: getMessageLimitErrorMessage({
              limitType: programmaticLimit.limitType,
              message: programmaticLimit.message,
            }),
          },
        });
      }
    }
  } else if (user && !isFreeOrigin(context.origin)) {
    // Non-credit-priced plans: no workspace pool and no Metronome per-user cap,
    // so the per-user credit limit is enforced solely from the Redis fixed-window
    // counter, bucketed on the UTC calendar month. Admin-set (poke) workspace
    // default, overridable per member. Free origins produce no billable usage,
    // and API keys have no per-user limit (they are gated by the programmatic
    // caps below). Flag-gated while we validate the counter; usage is recorded
    // regardless (in credit_cost), so the flag only controls blocking.
    const featureFlags = await getFeatureFlags(auth);
    if (
      featureFlags.includes("enforce_user_spend_limit_rate_cap") &&
      (await isNonCreditPricedUserSpendLimitReached(auth, { user }))
    ) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "user_cap_reached",
          message: "You have reached your personal usage cap.",
        },
      });
    }
  }

  if (
    !isCreditPricedWorkspace &&
    isProgrammaticUsage(auth, { userMessageOrigin: context.origin })
  ) {
    const limitsResult = await checkProgrammaticUsageLimits(auth);
    if (limitsResult.isErr()) {
      return new Err({
        status_code: 403,
        api_error: {
          type: limitsResult.error.type,
          message: getMessageLimitErrorMessage({
            limitType: limitsResult.error.type,
            message: limitsResult.error.message,
          }),
        },
      });
    }

    // Pre-emptive, credit-balance-scaled rate limit. Defends against the race
    // between in-flight programmatic requests and credit-debit settlement.
    // Reads legacy CreditResource balances, so it must only run on legacy plans
    // — on credit-priced plans the equivalent guard must come from the Metronome
    // pool (see TODO above).
    const rateLimit = await checkProgrammaticUsageRateLimit(auth);
    if (rateLimit.isLimitReached && rateLimit.limitType) {
      return new Err({
        status_code: 403,
        api_error: {
          type: rateLimit.limitType,
          message: getMessageLimitErrorMessage({
            limitType: rateLimit.limitType,
            message: rateLimit.message,
          }),
        },
      });
    }
  }

  const messageLimit = await isMessagesLimitReached(auth, {
    mentions,
    context,
  });
  if (messageLimit.isLimitReached && messageLimit.limitType) {
    return new Err({
      status_code: 403,
      api_error: {
        type: messageLimit.limitType,
        message: getMessageLimitErrorMessage({
          limitType: messageLimit.limitType,
          message: messageLimit.message,
        }),
      },
    });
  }
  return new Ok(undefined);
}

// For pool-credit (Metronome) plans, apply concurrency limiting based on
// the workspace pool credit state. When credits are running low the limit
// tightens so in-flight requests can't overshoot the pool before Metronome
// debits settle.
async function checkPoolCreditConcurrencyLimit(
  auth: Authenticator
): Promise<MessageLimit> {
  const owner = auth.getNonNullableWorkspace();
  const status = await getWorkspaceCreditPoolStatus(owner.sId);

  const maxConcurrent = POOL_CREDIT_CONCURRENCY_LIMITS[status];
  if (maxConcurrent === undefined) {
    // depleted / overage — handled by isUserBlocked / isApiBlocked upstream.
    return { isLimitReached: false, limitType: null };
  }

  const remaining = await rateLimiter({
    key: `pool_credit_concurrency:${owner.sId}`,
    maxPerTimeframe: maxConcurrent,
    timeframeSeconds: 60,
    logger,
  });

  if (remaining <= 0) {
    logger.info(
      {
        workspaceId: owner.sId,
        poolCreditStatus: status,
        maxConcurrent,
      },
      "Pool credit concurrency limit triggered."
    );

    statsDMetrics.increment(
      "assistant.rate_limiter.pool_credit.concurrency_limit_triggered",
      1,
      [`workspace_id:${owner.sId}`]
    );

    return {
      isLimitReached: true,
      limitType: "rate_limit_error",
    };
  }

  return { isLimitReached: false, limitType: null };
}

// For programmatic API calls on pool-credit (Metronome) plans, apply
// concurrency limiting based on the workspace programmatic credit state.
// Same close-to-0 defense as the pool concurrency limit, but driven by the
// programmatic monthly cap state machine.
async function checkProgrammaticCreditConcurrencyLimit(
  auth: Authenticator
): Promise<MessageLimit> {
  const owner = auth.getNonNullableWorkspace();
  const status = await getWorkspaceProgrammaticCreditStatus(owner.sId);

  const maxConcurrent = PROGRAMMATIC_CREDIT_CONCURRENCY_LIMITS[status];
  if (maxConcurrent === undefined) {
    // depleted — handled by isProgrammaticApiBlocked upstream.
    return { isLimitReached: false, limitType: null };
  }

  const remaining = await rateLimiter({
    key: `programmatic_credit_concurrency:${owner.sId}`,
    maxPerTimeframe: maxConcurrent,
    timeframeSeconds: 60,
    logger,
  });

  if (remaining <= 0) {
    logger.info(
      {
        workspaceId: owner.sId,
        programmaticCreditStatus: status,
        maxConcurrent,
      },
      "Programmatic credit concurrency limit triggered."
    );

    statsDMetrics.increment(
      "assistant.rate_limiter.programmatic_credit.concurrency_limit_triggered",
      1,
      [`workspace_id:${owner.sId}`]
    );

    return {
      isLimitReached: true,
      limitType: "rate_limit_error",
    };
  }

  return { isLimitReached: false, limitType: null };
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

    statsDMetrics.increment(
      "assistant.rate_limiter.programmatic_usage.credit_based_limit_triggered",
      1,
      [`workspace_id:${owner.sId}`]
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

        statsDMetrics.increment(
          "assistant.rate_limiter.key_cap.credit_based_limit_triggered",
          1,
          [`workspace_id:${owner.sId}`]
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
    } {
  const user = auth.user();
  if (user) {
    return { type: "user", id: user.id };
  }

  const apiKey = auth.key();
  if (apiKey) {
    return { type: "api_key", id: apiKey.id };
  }

  throw new Error(
    "Unexpected unauthenticated call to assistant message rate limiter."
  );
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

  const actorHourlyRemainingMessages = await rateLimiter({
    key: makeMessageRateLimitKeyForWorkspaceActorPerHour(owner, actor),
    maxPerTimeframe: MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR,
    timeframeSeconds: MESSAGE_RATE_LIMIT_PER_ACTOR_PER_HOUR_WINDOW_SECONDS,
    logger,
  });

  if (actorHourlyRemainingMessages <= 0) {
    return {
      isLimitReached: true,
      limitType: "rate_limit_error",
    };
  }

  // Credit-state and programmatic rate-limit checks live in `checkMessagesLimit`
  // (the caller). Programmatic flows skip the per-seat workspace fair-use cap
  // below, since they are gated by credits / pool balance instead.
  if (isProgrammaticUsage(auth, { userMessageOrigin: context.origin })) {
    return {
      isLimitReached: false,
      limitType: null,
    };
  }

  // Checking rate limit
  const activeSeats = await countActiveSeatsForWorkspace(owner.sId);

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
  const {
    maxAwuCredits,
    maxAwuCreditsTimeframe,
    maxMessages,
    maxMessagesTimeframe,
  } = plan.limits.assistant;

  const user = auth.user();
  const featureFlags = await getFeatureFlags(auth);
  // Escape hatch: the per-user fair-use AWU cap can be disabled per workspace.
  if (
    user &&
    maxAwuCredits !== -1 &&
    !featureFlags.includes("disable_fair_use_awu_limit")
  ) {
    const result = await getWeightedRateLimiterCount({
      key: makeFairUseAwuCreditsRateLimitKeyForUser(
        owner,
        user.toJSON(),
        maxAwuCreditsTimeframe
      ),
      timeframeSeconds: getTimeframeSecondsFromLiteral(maxAwuCreditsTimeframe),
    });

    // The counter stores microCredits; scale the credit-denominated limit the
    // same way before comparing.
    if (
      result.isOk() &&
      result.value >= roundCreditsToMicroCredits(maxAwuCredits)
    ) {
      return {
        isLimitReached: true,
        limitType: "plan_message_limit_exceeded",
      };
    }

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          userId: user.sId,
          error: result.error,
        },
        "Failed to read fair-use AWU credits rate limit."
      );
    }
  }

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
  const remainingMentions = await concurrentExecutor(
    agentMentions,
    () =>
      rateLimiter({
        key: makeAgentMentionsRateLimitKeyForWorkspace(
          owner,
          maxMessagesTimeframe
        ),
        maxPerTimeframe: effectiveMaxMessages,
        timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
        logger,
      }),
    { concurrency: 4 }
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

export async function isConversationEventAllowedForAuth(
  auth: Authenticator,
  {
    event,
  }: {
    event: ConversationEvents;
  }
): Promise<boolean> {
  const type = event.type;
  switch (type) {
    case "user_message_new":
    case "agent_message_new":
      return true;

    case "agent_message_consumption_updated":
    case "agent_message_done":
    case "compaction_message_new":
    case "compaction_message_done":
    case "conversation_fork_prepared":
    case "conversation_title":
    case "user_message_promoted":
    case "plan_updated":
    case "wake_up_updated":
      return true;

    default:
      assertNever(type);
  }
}

/**
 * Finalize an agent message terminal status behind the conversation advisory lock.
 *
 * This ensures the status transition is serialized against other conversation operations (e.g.
 * postUserMessage's pending path).
 */
export async function updateAgentMessageWithFinalStatus(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
    status,
    error,
    dangerouslyBypassSameStepCheck = false,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: AgentMessageType;
    status: Exclude<AgentMessageStatus, "created">;
    error?: ToolErrorEvent["error"];
    // Force finalization even if the message is in an anomalous state (e.g. blocked actions
    // spanning multiple steps). Used by the unstick-conversation poke plugin to rescue genuinely
    // stuck conversations. Leave false everywhere else so invariant violations surface as errors.
    dangerouslyBypassSameStepCheck?: boolean;
  }
): Promise<{
  completedTs: number;
  status: Exclude<AgentMessageStatus, "created">;
  // False when the message was already finalized (or deleted): callers must skip the terminal
  // side effects (event publish, unread state, conversation flags) of a late terminal event.
  applied: boolean;
}> {
  const completedAt = new Date();
  const owner = auth.getNonNullableWorkspace();

  const agentRestrictedBySpaceUsage = await isAgentRestrictedBySpaceUsage(
    auth,
    {
      configuration: agentMessage.configuration,
      conversation,
    }
  );

  const defaultModelResolution = agentMessage.configuration
    ? await resolveModelForMentionedAgent(auth, {
        configuration: agentMessage.configuration,
      })
    : null;

  const {
    promotedUserMessages,
    promotedAuth,
    agentMessage: newAgentMessage,
    deniedActions,
    skippedTransition,
  } = await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    // Only transition from "created": finalization is single-shot. A late terminal event from an
    // orphaned activity (e.g. an LLM call still running after an interrupt) must not overwrite
    // the final status nor re-run the pending-messages promotion below, which would spawn a
    // second concurrent agent loop.
    const [updatedCount] = await AgentMessageModel.update(
      {
        status,
        completedAt,
        ...(error
          ? {
              errorCode: error.code,
              errorMessage: error.message,
              errorMetadata: error.metadata,
            }
          : {}),
      },
      {
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: owner.id,
          status: "created",
        },
        transaction: t,
      }
    );

    if (updatedCount === 0) {
      const existingAgentMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: owner.id,
        },
        transaction: t,
      });

      // existingAgentMessage is null when the message row was deleted mid-finalize.
      return {
        promotedUserMessages: [] as UserMessageTypeWithoutMentions[],
        promotedAuth: auth,
        agentMessage: null as AgentMessageType | null,
        deniedActions: [],
        skippedTransition: { existingAgentMessage },
      };
    }

    const deniedActions = UNRESUMABLE_AGENT_MESSAGE_STATUSES.includes(status)
      ? await AgentMCPActionResource.denyBlockedActionsForAgentMessage(auth, {
          agentMessageId: agentMessage.agentMessageId,
          transaction: t,
          dangerouslyBypassSameStepCheck,
        })
      : [];

    // Promote *all* pending messages when the agent loop ends. If a pending message exists it
    // will be promoted and will trigger the ending agentMessage. The `enableSteering` invariants
    // of postUserMessage ensure that we have only one running agentic loop so we can just
    // recreate a new agentMessage for the same agent as the one that finished.
    //
    // There is an edge case here for API interactions which are not subject to the steering
    // invariant in which case we could have more than one running agent message and could pick
    // the wrong agent compared to user attempt. But should ~never happen so the simplicity is
    // worth it.
    const pendingMessages =
      await ConversationResource.getPendingUserMessagesInConversation(auth, {
        conversation,
        transaction: t,
      });

    if (pendingMessages.length === 0) {
      return {
        promotedUserMessages: [] as UserMessageTypeWithoutMentions[],
        promotedAuth: auth,
        agentMessage: null as AgentMessageType | null,
        deniedActions,
        skippedTransition: null,
      };
    }

    await MessageModel.update(
      { visibility: "visible" },
      {
        where: {
          id: pendingMessages.map((m) => m.id),
          workspaceId: owner.id,
        },
        // Skip validation: Sequelize bulk update constructs a dummy instance with only the
        // updated fields, so the beforeValidate hook (which checks that exactly one of
        // userMessageId/agentMessageId/ contentFragmentId is set) fails because all three are
        // undefined. The rows are already valid, we're only updating visibility.
        validate: false,
        transaction: t,
      }
    );

    const promotedUserMessages = await batchRenderUserMessagesWithoutMentions({
      messages: pendingMessages,
      transaction: t,
    });

    // The new agent message is triggered by the last steering message (being promoted here from
    // pending to visible). We need to use the promotedAuth of the associated user if it differs
    // from the user who owns the current agent message.
    const promotedUserMessage =
      promotedUserMessages[promotedUserMessages.length - 1];
    const promotedUser = promotedUserMessage.user;
    let promotedAuth = auth;
    if (promotedUser && promotedUser.sId !== auth.user()?.sId) {
      promotedAuth = await Authenticator.fromUserIdAndWorkspaceId(
        promotedUser.sId,
        owner.sId,
        { transaction: t }
      );
    }

    await ConversationResource.markAsUpdated(promotedAuth, {
      conversation,
      t,
    });

    if (status === "cancelled") {
      // When the agent message is cancelled it means the user pushed the "stop" button so the
      // intent is to abort all work. "interrupted" is NOT included here: the user chose to
      // redirect rather than stop, so pending messages continue processing.
      return {
        promotedUserMessages,
        promotedAuth,
        agentMessage: null,
        deniedActions,
        skippedTransition: null,
      };
    }

    if (!agentMessage.configuration) {
      // Configuration is not available (e.g., workflow error path where the agent
      // message is reconstructed without its configuration). Promote pending user
      // messages but don't attempt to create a new agent message.
      return {
        promotedUserMessages,
        promotedAuth,
        agentMessage: null,
        deniedActions,
        skippedTransition: null,
      };
    }

    const nextMessageRank = await getNextConversationMessageRank(auth, {
      conversation,
      transaction: t,
    });

    // The no-selection default was resolved before the transaction.
    let modelResolution =
      defaultModelResolution && !promotedUserMessage.requestedModel
        ? defaultModelResolution
        : await resolveModelForMentionedAgent(promotedAuth, {
            configuration: agentMessage.configuration,
            selection: promotedUserMessage.requestedModel ?? undefined,
          });

    const user = promotedAuth.user();
    if (user) {
      const premiumLimitResult = await enforcePremiumModelLimit(promotedAuth, {
        user,
        resolution: modelResolution,
        context: promotedUserMessage.context,
      });
      if (premiumLimitResult.isOk()) {
        modelResolution = premiumLimitResult.value;
      }
    }

    // Create a new agent message using the last promoted user message.
    const { agentMessages } = await createAgentMessages(promotedAuth, {
      conversation,
      metadata: {
        type: "create",
        agentConfiguration: agentMessage.configuration,
        skipToolsValidation: agentMessage.skipToolsValidation,
        nextMessageRank,
        userMessage: promotedUserMessages[promotedUserMessages.length - 1],
        modelResolution,
        isRestrictedBySpaceUsage: agentRestrictedBySpaceUsage,
      },
      transaction: t,
    });

    return {
      promotedUserMessages,
      promotedAuth,
      agentMessage: agentMessages[0] ?? null,
      deniedActions,
      skippedTransition: null,
    };
  });

  if (skippedTransition) {
    const { existingAgentMessage } = skippedTransition;

    logger.warn(
      {
        agentMessageId: agentMessage.sId,
        conversationId: conversation.sId,
        currentStatus: existingAgentMessage?.status ?? "not_found",
        requestedStatus: status,
        workspaceId: owner.sId,
      },
      "updateAgentMessageWithFinalStatus: message already finalized, skipping"
    );

    return {
      completedTs:
        existingAgentMessage?.completedAt?.getTime() ?? completedAt.getTime(),
      status:
        existingAgentMessage && existingAgentMessage.status !== "created"
          ? existingAgentMessage.status
          : status,
      applied: false,
    };
  }

  // Publish events and launch agent loop outside of the advisory lock.
  if (promotedUserMessages.length > 0) {
    for (const userMsg of promotedUserMessages) {
      await publishConversationEvent(
        {
          type: "user_message_promoted",
          created: Date.now(),
          messageId: userMsg.sId,
        },
        { conversationId: conversation.sId }
      );
    }
  }

  if (newAgentMessage) {
    await publishAgentMessagesEvents(conversation, [newAgentMessage]);

    void emitAuditLogEvent({
      auth: promotedAuth,
      action: "agent.executed",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("agent", newAgentMessage.configuration),
      ],
      metadata: {
        conversation_id: conversation.sId,
        agent_name: newAgentMessage.configuration.name,
        origin: "steering",
        ...(conversation.triggerId
          ? { trigger_id: conversation.triggerId }
          : {}),
        initiating_user_id: promotedAuth.user()?.sId ?? "unknown",
        initiating_user_email: promotedAuth.user()?.email ?? "unknown",
      },
    });

    await runAgentLoopWorkflow({
      auth: promotedAuth,
      agentMessages: [newAgentMessage],
      conversation,
      userMessage: promotedUserMessages[promotedUserMessages.length - 1],
    });
  }

  // The agent message will never resume: tools still waiting on user input (e.g. a manual
  // approval that the user skipped by interrupting the message) will never run. They were
  // denied with the terminal status update; clean up side effects so the conversation doesn't
  // stay flagged as requiring an action in the inbox. Runs last so a cleanup failure cannot
  // strand the promoted messages above (the cleanup itself is
  // idempotent, so an activity retry converges).
  if (UNRESUMABLE_AGENT_MESSAGE_STATUSES.includes(status)) {
    await cleanupDeniedBlockedActions(auth, {
      conversation,
      agentMessage,
      deniedActions,
    });
  }

  return {
    completedTs: completedAt.getTime(),
    status,
    applied: true,
  };
}
