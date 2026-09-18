import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { getEnabledSkillIdsFromAction } from "@app/lib/api/assistant/agent_message_consumption_attribution/enabled_skill_footprint";
import { INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/consumption/version";
import { listAgenticAncestors } from "@app/lib/api/assistant/conversation/agentic_ancestors";
import { resolvedModelFromAgentMessageRow } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import {
  USAGE_TYPE_FREE,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentMessageConsumptionAnalyticsInput,
  BilledRunUsage,
  ConsumptionAnalyticsSource,
  LoadAgentMessageConsumptionAnalyticsInputOptions,
  LoadConsumptionOptions,
  LoadSettledAttributionOptions,
} from "@app/types/assistant/agent_message_consumption_analytics";
import { CONSUMPTION_RECONCILIATION_SOURCE } from "@app/types/assistant/agent_message_consumption_analytics";
import type { AgentMessageConsumptionAnalyticsUser } from "@app/types/assistant/analytics";
import {
  getAgentUsageAttributedId,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

// We only account for billed usage types in the analytics pipeline.
function isBilledRunUsage(
  usage: RunUsageWithRunKeyType
): usage is BilledRunUsage {
  switch (usage.usageType) {
    case USAGE_TYPE_USER:
    case USAGE_TYPE_PROGRAMMATIC:
      return true;

    case USAGE_TYPE_FREE:
      return false;

    case null:
      throw new Error("Run usage billing classification is incomplete");

    default:
      return assertNever(usage.usageType);
  }
}

async function loadApiKeyName(
  auth: Authenticator,
  apiKeyModelId: ModelId | null
): Promise<string | null> {
  if (apiKeyModelId === null) {
    return null;
  }

  const apiKey = await KeyResource.fetchByWorkspaceAndId({
    workspace: auth.getNonNullableWorkspace(),
    id: apiKeyModelId,
  });
  return apiKey && !apiKey.isSystem ? apiKey.name : null;
}

async function loadAgentTagIds(
  auth: Authenticator,
  {
    agentConfigurationId,
    agentConfigurationVersion,
  }: {
    agentConfigurationId: string;
    agentConfigurationVersion: number;
  }
): Promise<string[]> {
  if (isGlobalAgentId(agentConfigurationId)) {
    return [];
  }

  const tags = await TagResource.listForAgentVersion(
    auth,
    agentConfigurationId,
    agentConfigurationVersion
  );
  return tags.map((tag) => tag.sId);
}

async function loadAnalyticsUser({
  auth,
  at,
  userId,
}: {
  auth: Authenticator;
  at: Date;
  userId: string | null;
}): Promise<AgentMessageConsumptionAnalyticsUser | null> {
  if (userId === null) {
    return null;
  }

  const [user] = await UserResource.fetchByIds([userId]);
  assert(
    user,
    "Triggering user is missing while loading consumption analytics"
  );

  const workspace = auth.getNonNullableWorkspace();

  const [groups, seatType] = await Promise.all([
    GroupResource.listUserGroupsInWorkspace({
      auth,
      user,
      groupKinds: [...CAP_ELIGIBLE_GROUP_KINDS],
      at,
    }),
    MembershipResource.getActiveSeatTypeForUserModelId({
      workspace,
      userModelId: user.id,
      at,
    }),
  ]);

  return {
    id: user.sId,
    group_ids: groups.map((group) => group.sId).sort(),
    seat_type: seatType,
  };
}

/**
 * @cc [owner:id13,label:backend;data-integrity] consumption-analytics-source-identity
 * Settled attribution MUST load a terminal message by public ID and use its authoritative message
 * cost. Incremental consumption MUST load by model ID and derive its cost from ledger items.
 */
/**
 * @cc [owner:id13,label:backend;data-integrity] consumption-analytics-completion-time
 * Analytics completion time MUST equal the message's stored completion time. An unfinished
 * incremental snapshot MUST keep completion time `null`; message creation time MUST NOT substitute
 * for it.
 */
export async function loadAgentMessageConsumptionAnalyticsInput(
  auth: Authenticator,
  options: LoadAgentMessageConsumptionAnalyticsInputOptions
): Promise<AgentMessageConsumptionAnalyticsInput | null> {
  if (options.source === "consumption") {
    return loadConsumptionAnalyticsInput(auth, options);
  }

  return loadSettledAttributionAnalyticsInput(auth, options);
}

async function loadSettledAttributionAnalyticsInput(
  auth: Authenticator,
  { agentMessageId, preloadedActions }: LoadSettledAttributionOptions
): Promise<AgentMessageConsumptionAnalyticsInput | null> {
  const context =
    await ConversationResource.fetchAgentMessageConsumptionAnalyticsContext(
      auth,
      { agentMessageId }
    );
  if (!context) {
    return null;
  }

  const { agentMessage } = context;
  if (
    !AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status) ||
    !isTerminalAgentMessageStatus(agentMessage.status)
  ) {
    return null;
  }
  if (!agentMessage.completedAt) {
    throw new Error("Settled agent message is missing completedAt");
  }
  const { costCredits } = agentMessage;
  if (costCredits === null) {
    throw new Error("Billed agent message is missing costCredits");
  }
  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessage.agentMessageModelId],
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    });

  return loadAnalyticsInputFromSource(auth, {
    preloadedActions,
    source: {
      billedCredits: costCredits,
      completedAt: agentMessage.completedAt,
      context,
      items,
      reconciliationSource: CONSUMPTION_RECONCILIATION_SOURCE.Derived,
    },
  });
}

async function loadConsumptionAnalyticsInput(
  auth: Authenticator,
  { agentMessageModelId, preloadedActions }: LoadConsumptionOptions
): Promise<AgentMessageConsumptionAnalyticsInput | null> {
  const context =
    await ConversationResource.fetchAgentMessageConsumptionAnalyticsContext(
      auth,
      { agentMessageModelId }
    );
  if (!context) {
    return null;
  }

  const { agentMessage } = context;
  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessage.agentMessageModelId],
      maxAttributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
    });
  const billedCredits = microCreditsToCredits(
    items
      .filter(
        (item) =>
          item.attributionVersion ===
          INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION
      )
      .reduce(
        (total, item) =>
          total +
          (item.reconciledCreditAmountMicro ??
            item.grossAttributedCreditAmountMicro),
        0
      )
  );
  return loadAnalyticsInputFromSource(auth, {
    preloadedActions,
    source: {
      billedCredits,
      completedAt: agentMessage.completedAt,
      context,
      items,
      reconciliationSource: CONSUMPTION_RECONCILIATION_SOURCE.Stored,
    },
  });
}

async function loadAnalyticsInputFromSource(
  auth: Authenticator,
  {
    preloadedActions,
    source,
  }: {
    preloadedActions?: AgentMCPActionResource[];
    source: ConsumptionAnalyticsSource;
  }
): Promise<AgentMessageConsumptionAnalyticsInput | null> {
  const workspace = auth.getNonNullableWorkspace();
  const { billedCredits, completedAt, context, items, reconciliationSource } =
    source;
  const { agentMessage, conversation, triggeringUserMessage } = context;
  const agentMessageId = agentMessage.agentMessageId;
  // Deleted conversations still incurred billable consumption and must remain visible in
  // historical analytics. This system workflow is already workspace-scoped and loads the message
  // graph without user permission filtering, so load the conversation under the same conditions.
  const messageConversation = await ConversationResource.fetchById(
    auth,
    conversation.conversationId,
    {
      dangerouslySkipPermissionFiltering: true,
      includeDeleted: true,
    }
  );
  if (!messageConversation) {
    throw new Error("Agent message conversation not found");
  }

  const dustRunIds = [...new Set(agentMessage.runIds ?? [])];
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });
  const billedUsages = usages.filter(isBilledRunUsage);
  if (billedUsages.length === 0) {
    return null;
  }
  const apiKeyName = await loadApiKeyName(
    auth,
    triggeringUserMessage.apiKeyModelId
  );
  const actions =
    preloadedActions ??
    (await AgentMCPActionResource.listByAgentMessageIds(auth, [
      agentMessage.agentMessageModelId,
    ]));
  const actionsWithOutputs =
    await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
      actions,
      ignoreContent: false,
    });
  const enabledSkillIdsByActionId = new Map(
    actionsWithOutputs.flatMap((action) => {
      const skillIds = getEnabledSkillIdsFromAction(action);
      return skillIds.length > 0 ? [[action.sId, skillIds] as const] : [];
    })
  );
  const stepContents = await AgentStepContentResource.fetchByAgentMessages(
    auth,
    { agentMessageIds: [agentMessage.agentMessageModelId] }
  );
  const skills = await SkillResource.listByAgentMessageId(
    auth,
    agentMessage.agentMessageModelId,
    { withToolMetadata: true }
  );
  const ancestorAgentIds = (
    await listAgenticAncestors(auth, messageConversation, {
      agentMessageId,
      includeDeleted: true,
    })
  )
    .map((ancestor) => ancestor.agentConfigurationId)
    .reverse();
  const attributedAgentId = getAgentUsageAttributedId({
    agentId: agentMessage.agentConfigurationId,
    parentAgentId: ancestorAgentIds.at(-1),
  });
  const agentTagIds = await loadAgentTagIds(auth, agentMessage);
  const user = await loadAnalyticsUser({
    auth,
    at: completedAt ?? agentMessage.createdAt,
    userId: triggeringUserMessage.userId,
  });

  const resolvedModel = resolvedModelFromAgentMessageRow({
    resolvedModelId: agentMessage.resolvedModelId,
    resolvedProviderId: agentMessage.resolvedProviderId,
    resolvedReasoningEffort: agentMessage.resolvedReasoningEffort,
  });

  return {
    actions,
    agent: {
      attributed_id: attributedAgentId,
      id: agentMessage.agentConfigurationId,
      version: agentMessage.agentConfigurationVersion.toString(),
      tag_ids: agentTagIds,
      parent_ids: ancestorAgentIds,
      direct_parent_id: ancestorAgentIds.at(-1) ?? null,
      root_id: ancestorAgentIds[0] ?? agentMessage.agentConfigurationId,
      depth: conversation.depth,
    },
    agentMessageId,
    apiKeyName,
    billedCredits,
    completedAt,
    contextOrigin: triggeringUserMessage.origin,
    conversationId: conversation.conversationId,
    dustRunIds,
    enabledSkillIdsByActionId,
    items,
    messageStatus: agentMessage.status,
    messageVersion: agentMessage.version,
    model: resolvedModel
      ? {
          provider_id: resolvedModel.providerId,
          model_id: resolvedModel.modelId,
          reasoning_effort: resolvedModel.reasoningEffort,
          resolution_method: agentMessage.modelResolutionMethod,
        }
      : null,
    parentMessageId: triggeringUserMessage.agenticOriginMessageId ?? null,
    runs,
    reconciliationSource,
    skills,
    spaceId:
      conversation.spaceModelId === null
        ? null
        : SpaceResource.modelIdToSId({
            id: conversation.spaceModelId,
            workspaceId: workspace.id,
          }),
    stepContents,
    triggerId: ConversationResource.triggerIdToSId(
      conversation.triggerModelId,
      workspace.id
    ),
    usages: billedUsages,
    // userId is a nullable FK with ON DELETE SET NULL. Never substitute the worker identity.
    user,
    workspaceId: workspace.sId,
  };
}
