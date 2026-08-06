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
}: {
  actions: AgentMCPActionResource[];
  attributionVersion: number;
  billedCredits: number;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
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

  const reconciledCreditAmounts = reconcileInputCredits({
    items,
    billedCredits,
  });
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
}: {
  actions: AgentMCPActionResource[];
  billedCredits: number | null;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
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
    });
    if (allocation) {
      return allocation;
    }
  }

  return null;
}
