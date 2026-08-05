import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { getToolAggregateDisplayLabel } from "@app/lib/actions/tool_display_labels";
import {
  creditsToMicroCredits,
  microCreditsToCredits,
} from "@app/lib/credits/units";
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

const FIRST_ATTRIBUTION_VERSION_WITH_TOOL_ROWS = 2;
export type MessageConsumptionDetails = AgentMessageConsumptionDetails & {
  models: AgentMessageConsumptionModelDetails[];
};

type ReconciledCreditAmounts = {
  byItem: ReadonlyMap<AgentMessageConsumptionItemResource, number>;
};

/**
 * Makes the attribution additive with the authoritative bill without changing stored evidence.
 *
 * Tool rows already represent the causal first-use cost of emitting a tool call and carrying its
 * new result into the next model input. We keep every non-input attribution unchanged. The model's
 * ordinary `input` bucket contains reused conversation context, so it is the single explicit
 * reconciliation seam.
 *
 * Multiple input rows share the reconciled input total in proportion to their cache-naive cost.
 * Allocation happens in integer micro-credits and assigns rounding remainders deterministically in
 * input order. If the non-input evidence alone exceeds the bill, no input-only reconciliation is
 * possible and the detailed breakdown is withheld.
 */
function reconcileInputCredits({
  items,
  billedCredits,
}: {
  items: AgentMessageConsumptionItemResource[];
  billedCredits: number;
}): ReconciledCreditAmounts | null {
  const billedCreditAmountMicro = creditsToMicroCredits(billedCredits);
  const inputItems = items.filter((item) => item.itemType === "input");
  const nonInputCreditAmountMicro = items.reduce(
    (total, item) =>
      item.itemType === "input"
        ? total
        : total + item.grossAttributedCreditAmountMicro,
    0
  );
  // Non-input rows stay fixed, so input absorbs the difference from the bill.
  const reconciledInputCreditAmountMicro =
    billedCreditAmountMicro - nonInputCreditAmountMicro;
  if (reconciledInputCreditAmountMicro < 0) {
    return null;
  }

  const grossInputCreditAmountMicro = inputItems.reduce(
    (total, item) => total + item.grossAttributedCreditAmountMicro,
    0
  );
  // A positive input total cannot be allocated without any input weight.
  if (grossInputCreditAmountMicro === 0) {
    return reconciledInputCreditAmountMicro === 0
      ? {
          byItem: new Map(
            items.map((item) => [item, item.grossAttributedCreditAmountMicro])
          ),
        }
      : null;
  }

  // Preserve the relative weight of the cache-naive input rows.
  const inputAllocations = inputItems.map((item, index) => {
    const inputShare =
      item.grossAttributedCreditAmountMicro / grossInputCreditAmountMicro;
    const exactMicro = inputShare * reconciledInputCreditAmountMicro;
    const floorMicro = Math.floor(exactMicro);

    return {
      item,
      index,
      floorMicro,
      fractionalMicro: exactMicro - floorMicro,
    };
  });
  const allocatedFloorMicro = inputAllocations.reduce(
    (total, allocation) => total + allocation.floorMicro,
    0
  );
  const remainderMicro = reconciledInputCreditAmountMicro - allocatedFloorMicro;

  // Largest remainders and then source order make integer allocation deterministic.
  const allocationsReceivingRemainder = new Set(
    [...inputAllocations]
      .sort(
        (left, right) =>
          right.fractionalMicro - left.fractionalMicro ||
          left.index - right.index
      )
      .slice(0, remainderMicro)
      .map(({ item }) => item)
  );
  const reconciledInputCreditAmountByItem = new Map(
    inputAllocations.map(({ item, floorMicro }) => [
      item,
      floorMicro + (allocationsReceivingRemainder.has(item) ? 1 : 0),
    ])
  );

  return {
    byItem: new Map(
      items.map((item) => [
        item,
        item.itemType === "input"
          ? (reconciledInputCreditAmountByItem.get(item) ?? 0)
          : item.grossAttributedCreditAmountMicro,
      ])
    ),
  };
}

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

/** Ensures every provider-reported model bucket has a row for the active attribution version. */
function hasCompleteModelAttribution(
  items: AgentMessageConsumptionItemResource[],
  usages: RunUsageWithRunKeyType[]
): boolean {
  const itemTypesByRunUsageModelId = new Map<ModelId, Set<string>>();

  for (const item of items) {
    if (item.itemType === "tool" || item.runUsageId === null) {
      continue;
    }

    const itemTypes =
      itemTypesByRunUsageModelId.get(item.runUsageId) ?? new Set();
    itemTypes.add(item.itemType);
    itemTypesByRunUsageModelId.set(item.runUsageId, itemTypes);
  }

  return usages.every((usage) => {
    const itemTypes = itemTypesByRunUsageModelId.get(usage.runUsageModelId);
    return (
      itemTypes?.has("input") === true &&
      itemTypes.has("output") &&
      (usage.reasoningTokens === null || itemTypes.has("reasoning"))
    );
  });
}

/** Ensures every attributable action has a row and every settled action has final evidence. */
function hasCompleteToolAttribution({
  actions,
  items,
  dustRunIdsWithUsage,
}: {
  actions: AgentMCPActionResource[];
  items: AgentMessageConsumptionItemResource[];
  dustRunIdsWithUsage: Set<string>;
}): boolean {
  const toolItemByActionModelId = new Map<
    ModelId,
    AgentMessageConsumptionItemResource
  >();
  for (const item of items) {
    if (item.itemType === "tool" && item.agentMCPActionId !== null) {
      toolItemByActionModelId.set(item.agentMCPActionId, item);
    }
  }
  const actionModelIds = new Set(actions.map((action) => action.id));

  for (const actionModelId of toolItemByActionModelId.keys()) {
    if (!actionModelIds.has(actionModelId)) {
      return false;
    }
  }

  for (const action of actions) {
    const dustRunId = action.stepContent.dustRunId;
    if (!dustRunId || !dustRunIdsWithUsage.has(dustRunId)) {
      continue;
    }

    const item = toolItemByActionModelId.get(action.id);
    if (!item) {
      return false;
    }
    if (
      isToolExecutionStatusFinal(action.status) &&
      item.completedAt === null
    ) {
      return false;
    }
  }

  return true;
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

function buildMessageConsumptionDetails({
  actions,
  attributionVersion,
  billedCredits,
  dustRunIds,
  items,
  runs,
  usages,
}: {
  actions: AgentMCPActionResource[];
  attributionVersion: number;
  billedCredits: number | null;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: RunUsageWithRunKeyType[];
}): MessageConsumptionDetails | null {
  if (billedCredits === null || items.length === 0 || dustRunIds.length === 0) {
    return null;
  }

  const dustRunIdSet = new Set(dustRunIds);
  const messageRunModelIds = new Set(
    runs.filter((run) => dustRunIdSet.has(run.dustRunId)).map((run) => run.id)
  );
  const messageUsages = usages.filter((usage) =>
    messageRunModelIds.has(usage.runModelId)
  );
  if (messageUsages.length === 0) {
    return null;
  }

  const dustRunIdByRunModelId = new Map(
    runs.map((run) => [run.id, run.dustRunId])
  );
  const dustRunIdsWithUsage = new Set(
    messageUsages.flatMap((usage) => {
      const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
      return dustRunId ? [dustRunId] : [];
    })
  );

  if (
    !hasCompleteModelAttribution(items, messageUsages) ||
    (attributionVersion >= FIRST_ATTRIBUTION_VERSION_WITH_TOOL_ROWS &&
      !hasCompleteToolAttribution({
        actions,
        items,
        dustRunIdsWithUsage,
      }))
  ) {
    return null;
  }

  const reconciledCreditAmounts = reconcileInputCredits({
    items,
    billedCredits,
  });
  if (!reconciledCreditAmounts) {
    return null;
  }

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
  usages,
}: {
  actions: AgentMCPActionResource[];
  billedCredits: number | null;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: RunUsageWithRunKeyType[];
}): MessageConsumptionDetails | null {
  const itemsByAttributionVersion = new Map<
    number,
    AgentMessageConsumptionItemResource[]
  >();
  for (const item of items) {
    const versionItems =
      itemsByAttributionVersion.get(item.attributionVersion) ?? [];
    versionItems.push(item);
    itemsByAttributionVersion.set(item.attributionVersion, versionItems);
  }

  const attributionVersions = [...itemsByAttributionVersion.keys()].sort(
    (left, right) => right - left
  );
  for (const attributionVersion of attributionVersions) {
    const details = buildMessageConsumptionDetails({
      actions,
      attributionVersion,
      billedCredits,
      dustRunIds,
      items: itemsByAttributionVersion.get(attributionVersion) ?? [],
      runs,
      usages,
    });
    if (details) {
      return details;
    }
  }

  return null;
}
