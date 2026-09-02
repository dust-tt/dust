import { getToolAggregateDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
import type { AgentMCPActionType } from "@app/types/actions";
import type {
  AgentMessageConsumptionDetails,
  AgentMessageConsumptionModelDetails,
} from "@app/types/assistant/agent_message_consumption";
import type { ModelId } from "@app/types/shared/model_id";
import partition from "lodash/partition";
import type {
  MessageConsumptionAllocation,
  ReconciledCreditAmounts,
} from "./allocation";
import { buildLatestMessageConsumptionAllocation } from "./allocation";

export type MessageConsumptionDetails = AgentMessageConsumptionDetails & {
  models: AgentMessageConsumptionModelDetails[];
};

export type ToolConsumptionDetailsOverride = {
  additionalAttributedCredits: number;
  identity: string;
  label: string;
};

export type AgentWorkConsumptionDetailsOverride = {
  additionalAttributedCredits: number;
  actionModelIds: ReadonlySet<ModelId>;
};

function buildConsumptionTotals({
  items,
  reconciledCreditAmounts,
}: {
  items: AgentMessageConsumptionItemResource[];
  reconciledCreditAmounts: ReconciledCreditAmounts;
}): {
  agentWorkCredits: number;
} {
  const reconciledAgentWorkCreditAmountMicro = items.reduce(
    (total, item) => total + (reconciledCreditAmounts.byItem.get(item) ?? 0),
    0
  );

  return {
    agentWorkCredits: microCreditsToCredits(
      reconciledAgentWorkCreditAmountMicro
    ),
  };
}

function toolIdentity(action: AgentMCPActionType): string {
  const serverIdentity =
    action.mcpServerId ??
    action.internalMCPServerName ??
    action.functionCallName;

  return `${serverIdentity}:${action.toolName}`;
}

/** Groups repeated executions by tool identity while preserving first-use display order. */
function buildToolDetails({
  actions,
  items,
  reconciledCreditAmounts,
  toolDetailsOverridesByActionModelId,
}: {
  actions: AgentMCPActionResource[];
  items: AgentMessageConsumptionItemResource[];
  reconciledCreditAmounts: ReconciledCreditAmounts;
  toolDetailsOverridesByActionModelId?: ReadonlyMap<
    ModelId,
    ToolConsumptionDetailsOverride
  >;
}): MessageConsumptionDetails["tools"] | null {
  const actionByModelId = new Map(actions.map((action) => [action.id, action]));
  const actionIdsWithAppliedAdditionalCredits = new Set<ModelId>();
  const groupedTools = new Map<
    string,
    MessageConsumptionDetails["tools"][number] & { firstStep: number }
  >();

  for (const item of items) {
    if (item.itemType !== "tool" || item.agentMCPActionId === null) {
      continue;
    }

    const action = actionByModelId.get(item.agentMCPActionId);
    if (!action) {
      return null;
    }

    const serialized = action.toJSON();
    const override = toolDetailsOverridesByActionModelId?.get(action.id);
    const identity = override?.identity ?? toolIdentity(serialized);
    const current = groupedTools.get(identity);
    const additionalAttributedCredits =
      override && !actionIdsWithAppliedAdditionalCredits.has(action.id)
        ? override.additionalAttributedCredits
        : 0;
    actionIdsWithAppliedAdditionalCredits.add(action.id);
    const attributedCredits =
      microCreditsToCredits(reconciledCreditAmounts.byItem.get(item) ?? 0) +
      additionalAttributedCredits;
    const directCredits = microCreditsToCredits(
      item.directCreditAmountMicro ?? 0
    );

    if (current) {
      groupedTools.set(identity, {
        ...current,
        callCount: current.callCount + 1,
        attributedCredits: current.attributedCredits + attributedCredits,
        directCredits: current.directCredits + directCredits,
        pending: current.pending || item.completedAt === null,
        firstStep: Math.min(current.firstStep, serialized.step),
      });
      continue;
    }

    groupedTools.set(identity, {
      label: override?.label ?? getToolAggregateDisplayLabel(serialized),
      internalMCPServerName: serialized.internalMCPServerName,
      toolName: serialized.toolName,
      callCount: 1,
      attributedCredits,
      directCredits,
      pending: item.completedAt === null,
      firstStep: serialized.step,
    });
  }

  return [...groupedTools.values()]
    .sort((left, right) => left.firstStep - right.firstStep)
    .map(({ firstStep: _firstStep, ...tool }) => tool);
}

function buildModelDetails({
  items,
  usages,
  reconciledCreditAmounts,
}: {
  items: AgentMessageConsumptionItemResource[];
  usages: RunUsageWithRunKeyType[];
  reconciledCreditAmounts: ReconciledCreditAmounts;
}): MessageConsumptionDetails["models"] {
  const usageByModelId = new Map(
    usages.map((usage) => [usage.runUsageModelId, usage])
  );
  const models = new Map<string, MessageConsumptionDetails["models"][number]>();

  for (const item of items) {
    if (item.runUsageId === null) {
      continue;
    }

    const usage = usageByModelId.get(item.runUsageId);
    if (!usage) {
      continue;
    }

    const key = `${usage.providerId}:${usage.modelId}`;
    const attributedCredits = microCreditsToCredits(
      reconciledCreditAmounts.byItem.get(item) ?? 0
    );
    const existing = models.get(key);
    if (existing) {
      existing.attributedCredits += attributedCredits;
      continue;
    }

    models.set(key, {
      providerId: usage.providerId,
      modelId: usage.modelId,
      displayName:
        getModelConfigByModelId(usage.modelId)?.displayName ?? usage.modelId,
      attributedCredits,
    });
  }

  return [...models.values()].sort(
    (left, right) => right.attributedCredits - left.attributedCredits
  );
}

function buildMessageConsumptionDetails({
  actions,
  agentWorkDetailsOverride,
  allocation,
  toolDetailsOverridesByActionModelId,
}: {
  actions: AgentMCPActionResource[];
  agentWorkDetailsOverride?: AgentWorkConsumptionDetailsOverride;
  allocation: MessageConsumptionAllocation;
  toolDetailsOverridesByActionModelId?: ReadonlyMap<
    ModelId,
    ToolConsumptionDetailsOverride
  >;
}): MessageConsumptionDetails | null {
  const { attributionVersion, items, messageUsages, reconciledCreditAmounts } =
    allocation;
  const [agentWorkItems, toolItems] = partition(
    items,
    (item) =>
      item.itemType !== "tool" ||
      (item.agentMCPActionId !== null &&
        agentWorkDetailsOverride?.actionModelIds.has(item.agentMCPActionId))
  );

  const tools = buildToolDetails({
    actions,
    items: toolItems,
    reconciledCreditAmounts,
    toolDetailsOverridesByActionModelId,
  });
  if (!tools) {
    return null;
  }
  const { agentWorkCredits } = buildConsumptionTotals({
    items: agentWorkItems,
    reconciledCreditAmounts,
  });

  return {
    attributionVersion,
    agentWorkCredits:
      agentWorkCredits +
      (agentWorkDetailsOverride?.additionalAttributedCredits ?? 0),
    tools,
    models: buildModelDetails({
      items,
      usages: messageUsages,
      reconciledCreditAmounts,
    }),
  };
}

/** Selects the newest self-consistent attribution stored for a message. */
export function buildLatestAvailableMessageConsumptionDetails({
  actions,
  agentWorkDetailsOverride,
  billedCredits,
  dustRunIds,
  items,
  runs,
  toolDetailsOverridesByActionModelId,
  usages,
}: {
  actions: AgentMCPActionResource[];
  agentWorkDetailsOverride?: AgentWorkConsumptionDetailsOverride;
  billedCredits: number | null;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  toolDetailsOverridesByActionModelId?: ReadonlyMap<
    ModelId,
    ToolConsumptionDetailsOverride
  >;
  usages: RunUsageWithRunKeyType[];
}): MessageConsumptionDetails | null {
  const allocation = buildLatestMessageConsumptionAllocation({
    actions,
    billedCredits,
    dustRunIds,
    items,
    runs,
    usages,
  });
  if (!allocation) {
    return null;
  }

  return buildMessageConsumptionDetails({
    actions,
    agentWorkDetailsOverride,
    allocation,
    toolDetailsOverridesByActionModelId,
  });
}
