import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
import type { ConsumptionReconciliationSource } from "@app/types/assistant/agent_message_consumption_analytics";
import { CONSUMPTION_RECONCILIATION_SOURCE } from "@app/types/assistant/agent_message_consumption_analytics";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

export type AllocationSkipReason = {
  code:
    | "no_billed_credits"
    | "no_items_or_dust_run_ids"
    | "no_message_usages"
    | "incomplete_attribution"
    | "reconciliation_failed";
  context: Record<string, number | boolean>;
};

type MessageConsumptionAllocationInput<TUsage extends RunUsageWithRunKeyType> =
  {
    actions: AgentMCPActionResource[];
    billedCredits: number | null;
    dustRunIds: string[];
    items: AgentMessageConsumptionItemResource[];
    reconciliationSource: ConsumptionReconciliationSource;
    runs: RunResource[];
    usages: TUsage[];
  };

type MessageConsumptionAllocationForVersionInput<
  TUsage extends RunUsageWithRunKeyType,
> = Omit<MessageConsumptionAllocationInput<TUsage>, "billedCredits"> & {
  attributionVersion: number;
  billedCredits: number;
};

type PublicMessageConsumptionAllocationInput<
  TUsage extends RunUsageWithRunKeyType,
> = Omit<MessageConsumptionAllocationInput<TUsage>, "reconciliationSource">;

/**
 * @cc [owner:id13,label:backend;data-integrity] derived-credit-conservation
 * A successful reconciliation MUST preserve every non-input gross credit amount and allocate the
 * remaining billed credits across input items so all returned amounts sum exactly to the bill. It
 * MUST return `null` when the fixed non-input amounts exceed the bill or when a non-zero remainder
 * cannot be allocated to input items.
 */
/**
 * @cc [owner:id13,label:backend;data-integrity] deterministic-input-allocation
 * Input credits MUST be allocated proportionally to gross input credits in integer microcredits.
 * Rounding remainders MUST go to the largest fractional shares, using source order to break ties.
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

/**
 * @cc [owner:id13,label:backend;data-integrity] stored-credit-completeness
 * Reconciliation MUST return `null` unless every item has a stored reconciled credit amount.
 */
/**
 * @cc [owner:id13,label:backend;data-integrity] stored-credit-conservation
 * Reconciliation MUST return an allocation only when the stored item amounts sum exactly to the
 * expected billed credits in integer microcredits. A mismatch MUST return `null` so the caller
 * rejects the inconsistent attribution version.
 */
function reconcileStoredCredits({
  items,
  billedCredits,
}: {
  items: AgentMessageConsumptionItemResource[];
  billedCredits: number;
}): ReconciledCreditAmounts | null {
  const byItem = new Map<AgentMessageConsumptionItemResource, number>();
  for (const item of items) {
    if (item.reconciledCreditAmountMicro === null) {
      return null;
    }
    byItem.set(item, item.reconciledCreditAmountMicro);
  }

  const storedTotalCreditAmountMicro = [...byItem.values()].reduce(
    (total, amount) => total + amount,
    0
  );
  const expectedTotalCreditAmountMicro =
    roundCreditsToMicroCredits(billedCredits);
  return storedTotalCreditAmountMicro === expectedTotalCreditAmountMicro
    ? { byItem }
    : null;
}

/**
 * @cc [owner:id13,label:backend;data-integrity] complete-model-attribution
 * Model attribution MUST be complete only when every message usage has input and output items, plus
 * a reasoning item whenever that usage reports reasoning tokens.
 */
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

/**
 * @cc [owner:id13,label:backend;data-integrity] complete-tool-attribution
 * Tool attribution MUST be complete only when every action attached to a run with message usage has
 * an item, every item that names an action refers to a supplied action, and every such final action
 * has a completed item.
 */
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

/**
 * @cc [owner:id13,label:backend;data-integrity] version-allocation-acceptance
 * An attribution version MUST be accepted only when it has message items and run IDs, at least one
 * matching message usage, complete model and tool attribution, and a successful credit
 * reconciliation.
 */
function buildMessageConsumptionAllocationForVersion<
  TUsage extends RunUsageWithRunKeyType,
>({
  actions,
  attributionVersion,
  billedCredits,
  dustRunIds,
  items,
  reconciliationSource,
  runs,
  usages,
}: MessageConsumptionAllocationForVersionInput<TUsage>): Result<
  MessageConsumptionAllocation<TUsage>,
  AllocationSkipReason
> {
  if (items.length === 0 || dustRunIds.length === 0) {
    return new Err({
      code: "no_items_or_dust_run_ids",
      context: {
        attributionVersion,
        dustRunIdCount: dustRunIds.length,
        itemCount: items.length,
      },
    });
  }

  const dustRunIdSet = new Set(dustRunIds);
  const messageRunModelIds = new Set(
    runs.filter((run) => dustRunIdSet.has(run.dustRunId)).map((run) => run.id)
  );
  const messageUsages = usages.filter((usage) =>
    messageRunModelIds.has(usage.runModelId)
  );
  if (messageUsages.length === 0) {
    return new Err({
      code: "no_message_usages",
      context: {
        attributionVersion,
        dustRunIdCount: dustRunIds.length,
        runCount: runs.length,
        matchedRunCount: messageRunModelIds.size,
        totalUsageCount: usages.length,
      },
    });
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

  const completeModel = hasCompleteModelAttribution(items, messageUsages);
  const completeTool =
    attributionVersion < FIRST_ATTRIBUTION_VERSION_WITH_TOOL_ROWS ||
    hasCompleteToolAttribution({
      actions,
      items,
      dustRunIdsWithUsage,
    });

  if (!completeModel || !completeTool) {
    return new Err({
      code: "incomplete_attribution",
      context: {
        attributionVersion,
        completeModel,
        completeTool,
        itemCount: items.length,
        messageUsageCount: messageUsages.length,
        actionCount: actions.length,
      },
    });
  }

  const reconciledCreditAmounts =
    reconciliationSource === CONSUMPTION_RECONCILIATION_SOURCE.Stored
      ? reconcileStoredCredits({ items, billedCredits })
      : reconcileInputCredits({ items, billedCredits });
  if (!reconciledCreditAmounts) {
    const billedCreditAmountMicro = roundCreditsToMicroCredits(billedCredits);
    const nonInputCreditAmountMicro = items.reduce(
      (total, item) =>
        item.itemType === "input"
          ? total
          : total + item.grossAttributedCreditAmountMicro,
      0
    );
    return new Err({
      code: "reconciliation_failed",
      context: {
        attributionVersion,
        billedCreditAmountMicro,
        nonInputCreditAmountMicro,
        inputItemCount: items.filter((item) => item.itemType === "input")
          .length,
      },
    });
  }

  return new Ok({
    attributionVersion,
    items,
    messageUsages,
    reconciledCreditAmounts,
  });
}

/**
 * @cc [owner:id13,label:backend;data-integrity] newest-consistent-attribution
 * Attribution versions MUST be evaluated from newest to oldest. The first complete, reconciled
 * version MUST be returned; a rejected newer version MUST NOT prevent fallback to an older one.
 */
function buildMessageConsumptionAllocation<
  TUsage extends RunUsageWithRunKeyType,
>({
  actions,
  billedCredits,
  dustRunIds,
  items,
  reconciliationSource,
  runs,
  usages,
}: MessageConsumptionAllocationInput<TUsage>): Result<
  MessageConsumptionAllocation<TUsage>,
  AllocationSkipReason
> {
  if (billedCredits === null) {
    return new Err({ code: "no_billed_credits", context: {} });
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
  let lastSkipReason: AllocationSkipReason | undefined;
  for (const attributionVersion of attributionVersions) {
    const result = buildMessageConsumptionAllocationForVersion({
      actions,
      attributionVersion,
      billedCredits,
      dustRunIds,
      items: itemsByAttributionVersion.get(attributionVersion) ?? [],
      reconciliationSource,
      runs,
      usages,
    });
    if (result.isOk()) {
      return result;
    }
    lastSkipReason = result.error;
  }

  return new Err(
    lastSkipReason ?? {
      code: "no_items_or_dust_run_ids",
      context: { itemCount: 0, dustRunIdCount: dustRunIds.length },
    }
  );
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
}: PublicMessageConsumptionAllocationInput<TUsage>): Result<
  MessageConsumptionAllocation<TUsage>,
  AllocationSkipReason
> {
  return buildMessageConsumptionAllocation({
    actions,
    billedCredits,
    dustRunIds,
    items,
    reconciliationSource: CONSUMPTION_RECONCILIATION_SOURCE.Derived,
    runs,
    usages,
  });
}

/**
 * @cc [owner:id13,label:backend;data-integrity] stored-consumption-reconciliation
 * Every item in a stored consumption allocation MUST have a reconciled credit amount, and those
 * amounts MUST sum exactly to the authoritative billed credits.
 */
export function buildStoredMessageConsumptionAllocation<
  TUsage extends RunUsageWithRunKeyType,
>({
  actions,
  billedCredits,
  dustRunIds,
  items,
  runs,
  usages,
}: PublicMessageConsumptionAllocationInput<TUsage>): Result<
  MessageConsumptionAllocation<TUsage>,
  AllocationSkipReason
> {
  return buildMessageConsumptionAllocation({
    actions,
    billedCredits,
    dustRunIds,
    items,
    reconciliationSource: CONSUMPTION_RECONCILIATION_SOURCE.Stored,
    runs,
    usages,
  });
}
