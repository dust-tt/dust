import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
import type { ModelId } from "@app/types/shared/model_id";

const FIRST_ATTRIBUTION_VERSION_WITH_TOOL_ROWS = 2;

export type ReconciledCreditAmounts = {
  byItem: ReadonlyMap<AgentMessageConsumptionItemResource, number>;
};

export type MessageConsumptionAllocation<
  TUsage extends RunUsageWithRunKeyType = RunUsageWithRunKeyType,
> = {
  attributionVersion: number;
  items: AgentMessageConsumptionItemResource[];
  messageUsages: TUsage[];
  reconciledCreditAmounts: ReconciledCreditAmounts;
};

/**
 * Makes the attribution additive with the authoritative bill without changing stored evidence.
 *
 * Tool rows already represent the causal first-use cost of emitting a tool call and carrying its
 * new result into the next model input. We keep every non-input attribution unchanged. The model's
 * ordinary `input` bucket contains reused conversation context, so it is the single explicit
 * reconciliation seam. Input rows share the reconciled remainder in proportion to their gross
 * cost, using deterministic integer microcredit rounding.
 */
function reconcileInputCredits({
  items,
  billedCredits,
}: {
  items: AgentMessageConsumptionItemResource[];
  billedCredits: number;
}): ReconciledCreditAmounts | null {
  const billedCreditAmountMicro = roundCreditsToMicroCredits(billedCredits);
  const inputItems = items.filter((item) => item.itemType === "input");
  const nonInputCreditAmountMicro = items.reduce(
    (total, item) =>
      item.itemType === "input"
        ? total
        : total + item.grossAttributedCreditAmountMicro,
    0
  );
  const reconciledInputCreditAmountMicro =
    billedCreditAmountMicro - nonInputCreditAmountMicro;
  if (reconciledInputCreditAmountMicro < 0) {
    return null;
  }

  const grossInputCreditAmountMicro = inputItems.reduce(
    (total, item) => total + item.grossAttributedCreditAmountMicro,
    0
  );
  if (grossInputCreditAmountMicro === 0) {
    return reconciledInputCreditAmountMicro === 0
      ? {
          byItem: new Map(
            items.map((item) => [item, item.grossAttributedCreditAmountMicro])
          ),
        }
      : null;
  }

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
  // Largest remainders and then source order keep allocation stable.
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

function reconcileStoredConsumptionCredits({
  items,
  billedCredits,
}: {
  items: AgentMessageConsumptionItemResource[];
  billedCredits: number;
}): ReconciledCreditAmounts | null {
  const documentItems = items.filter((item) => item.itemType !== "rounding");
  const byItem = new Map<AgentMessageConsumptionItemResource, number>();
  for (const item of documentItems) {
    if (item.reconciledCreditAmountMicro === null) {
      return null;
    }
    byItem.set(item, item.reconciledCreditAmountMicro);
  }

  for (const roundingItem of items.filter(
    (item) => item.itemType === "rounding"
  )) {
    const roundingAmount = roundingItem.reconciledCreditAmountMicro;
    if (roundingAmount === null) {
      return null;
    }
    if (roundingAmount === 0) {
      continue;
    }
    const targetInput = documentItems.find(
      (item) => item.runKey === roundingItem.runKey && item.itemType === "input"
    );
    if (!targetInput) {
      return null;
    }
    byItem.set(targetInput, (byItem.get(targetInput) ?? 0) + roundingAmount);
  }

  const allocatedAmountMicro = [...byItem.values()].reduce(
    (total, amount) => total + amount,
    0
  );
  return allocatedAmountMicro === roundCreditsToMicroCredits(billedCredits)
    ? { byItem }
    : null;
}

function hasCompleteModelAttribution(
  items: AgentMessageConsumptionItemResource[],
  usages: RunUsageWithRunKeyType[]
): boolean {
  const itemTypesByRunUsageModelId = new Map<ModelId, Set<string>>();

  for (const item of items) {
    if (item.isToolItem() || item.runUsageId === null) {
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

function hasCompleteToolAttribution({
  actions,
  items,
  dustRunIdsWithUsage,
}: {
  actions: AgentMCPActionResource[];
  items: AgentMessageConsumptionItemResource[];
  dustRunIdsWithUsage: Set<string>;
}): boolean {
  const toolItemsByActionModelId = new Map<
    ModelId,
    AgentMessageConsumptionItemResource[]
  >();
  for (const item of items) {
    if (item.isToolItem()) {
      const actionItems =
        toolItemsByActionModelId.get(item.agentMCPActionId) ?? [];
      actionItems.push(item);
      toolItemsByActionModelId.set(item.agentMCPActionId, actionItems);
    }
  }
  const actionModelIds = new Set(actions.map((action) => action.id));

  for (const actionModelId of toolItemsByActionModelId.keys()) {
    if (!actionModelIds.has(actionModelId)) {
      return false;
    }
  }

  for (const action of actions) {
    const dustRunId = action.stepContent.dustRunId;
    if (!dustRunId || !dustRunIdsWithUsage.has(dustRunId)) {
      continue;
    }

    const actionItems = toolItemsByActionModelId.get(action.id);
    if (!actionItems) {
      return false;
    }
    if (
      isToolExecutionStatusFinal(action.status) &&
      actionItems.some((item) => item.completedAt === null)
    ) {
      return false;
    }
  }

  return true;
}

function buildMessageConsumptionAllocationForVersion<
  TUsage extends RunUsageWithRunKeyType,
>({
  actions,
  attributionVersion,
  billedCredits,
  dustRunIds,
  items,
  runs,
  usages,
  useStoredReconciledCredits,
}: {
  actions: AgentMCPActionResource[];
  attributionVersion: number;
  billedCredits: number;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
  useStoredReconciledCredits: boolean;
}): MessageConsumptionAllocation<TUsage> | null {
  if (items.length === 0 || dustRunIds.length === 0) {
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

  const reconciledCreditAmounts = useStoredReconciledCredits
    ? reconcileStoredConsumptionCredits({ items, billedCredits })
    : reconcileInputCredits({ items, billedCredits });
  if (!reconciledCreditAmounts) {
    return null;
  }

  return {
    attributionVersion,
    items,
    messageUsages,
    reconciledCreditAmounts,
  };
}

/** Selects and allocates the newest self-consistent attribution stored for a message. */
export function buildLatestMessageConsumptionAllocation<
  TUsage extends RunUsageWithRunKeyType,
>({
  actions,
  billedCredits,
  dustRunIds,
  items,
  runs,
  usages,
  useStoredReconciledCredits = false,
}: {
  actions: AgentMCPActionResource[];
  billedCredits: number | null;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
  useStoredReconciledCredits?: boolean;
}): MessageConsumptionAllocation<TUsage> | null {
  if (billedCredits === null) {
    return null;
  }

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
    const allocation = buildMessageConsumptionAllocationForVersion({
      actions,
      attributionVersion,
      billedCredits,
      dustRunIds,
      items: itemsByAttributionVersion.get(attributionVersion) ?? [],
      runs,
      usages,
      useStoredReconciledCredits,
    });
    if (allocation) {
      return allocation;
    }
  }

  return null;
}
