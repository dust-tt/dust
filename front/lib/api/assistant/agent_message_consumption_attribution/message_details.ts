import { getToolAggregateDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentMCPActionType } from "@app/types/actions";
import type {
  AgentMessageConsumptionDetails,
  AgentMessageConsumptionModelDetails,
} from "@app/types/assistant/agent_message_consumption";
import type {
  MessageConsumptionAllocation,
  ReconciledCreditAmounts,
} from "./allocation";
import { buildLatestMessageConsumptionAllocation } from "./allocation";
import { skillIdsAttributedToAction } from "./skill_attribution";

export type MessageConsumptionSkillDetails = {
  skillId: string;
  attributedCredits: number;
};

export type MessageConsumptionDetails = AgentMessageConsumptionDetails & {
  models: AgentMessageConsumptionModelDetails[];
  skills: MessageConsumptionSkillDetails[];
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
    (total, item) =>
      item.itemType === "tool"
        ? total
        : total + (reconciledCreditAmounts.byItem.get(item) ?? 0),
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
}: {
  actions: AgentMCPActionResource[];
  items: AgentMessageConsumptionItemResource[];
  reconciledCreditAmounts: ReconciledCreditAmounts;
}): MessageConsumptionDetails["tools"] | null {
  const actionByModelId = new Map(actions.map((action) => [action.id, action]));
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
    const identity = toolIdentity(serialized);
    const current = groupedTools.get(identity);
    const attributedCredits = microCreditsToCredits(
      reconciledCreditAmounts.byItem.get(item) ?? 0
    );
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
      label: getToolAggregateDisplayLabel(serialized),
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

function buildSkillDetails({
  actions,
  enabledSkillIdsByActionId,
  items,
  reconciledCreditAmounts,
  skills,
}: {
  actions: AgentMCPActionResource[];
  enabledSkillIdsByActionId: ReadonlyMap<string, string[]>;
  items: AgentMessageConsumptionItemResource[];
  reconciledCreditAmounts: ReconciledCreditAmounts;
  skills: SkillResource[];
}): MessageConsumptionSkillDetails[] {
  const actionByModelId = new Map(actions.map((action) => [action.id, action]));
  const skillCredits = new Map<string, number>();

  for (const item of items) {
    if (item.itemType !== "tool" || item.agentMCPActionId === null) {
      continue;
    }

    const action = actionByModelId.get(item.agentMCPActionId);
    if (!action) {
      continue;
    }

    const attributedCredits = microCreditsToCredits(
      reconciledCreditAmounts.byItem.get(item) ?? 0
    );
    for (const skillId of skillIdsAttributedToAction(
      skills,
      action,
      enabledSkillIdsByActionId.get(action.sId) ?? []
    )) {
      skillCredits.set(
        skillId,
        (skillCredits.get(skillId) ?? 0) + attributedCredits
      );
    }
  }

  return [...skillCredits.entries()]
    .map(([skillId, attributedCredits]) => ({
      skillId,
      attributedCredits,
    }))
    .filter((skill) => skill.attributedCredits > 0)
    .sort((left, right) => right.attributedCredits - left.attributedCredits);
}

function buildMessageConsumptionDetails({
  actions,
  allocation,
  enabledSkillIdsByActionId,
  skills,
}: {
  actions: AgentMCPActionResource[];
  allocation: MessageConsumptionAllocation;
  enabledSkillIdsByActionId: ReadonlyMap<string, string[]>;
  skills: SkillResource[];
}): MessageConsumptionDetails | null {
  const { attributionVersion, items, messageUsages, reconciledCreditAmounts } =
    allocation;

  const tools = buildToolDetails({
    actions,
    items,
    reconciledCreditAmounts,
  });
  if (!tools) {
    return null;
  }

  return {
    attributionVersion,
    ...buildConsumptionTotals({
      items,
      reconciledCreditAmounts,
    }),
    tools,
    skills: buildSkillDetails({
      actions,
      enabledSkillIdsByActionId,
      items,
      reconciledCreditAmounts,
      skills,
    }),
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
  billedCredits,
  dustRunIds,
  items,
  runs,
  enabledSkillIdsByActionId = new Map(),
  skills = [],
  usages,
}: {
  actions: AgentMCPActionResource[];
  billedCredits: number | null;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  enabledSkillIdsByActionId?: ReadonlyMap<string, string[]>;
  skills?: SkillResource[];
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
    allocation,
    enabledSkillIdsByActionId,
    skills,
  });
}
