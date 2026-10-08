import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { splitRecordedUsageCost } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
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

type ReconciliationFailureCode =
  | "output_exceeds_recorded_cost"
  | "cost_without_item"
  | "direct_credits_exceed_bill"
  | "llm_bill_mismatch";

export type AllocationSkipReason = {
  code:
    | "no_billed_credits"
    | "no_items_or_dust_run_ids"
    | "no_message_usages"
    | "incomplete_attribution"
    | ReconciliationFailureCode;
  context: Record<string, number | boolean>;
};

type WeightedItem = {
  item: AgentMessageConsumptionItemResource;
  weight: number;
};

function addWeightedShares({
  amountMicroUsd,
  entries,
  sharesMicroUsd,
}: {
  amountMicroUsd: number;
  entries: WeightedItem[];
  sharesMicroUsd: Map<AgentMessageConsumptionItemResource, number>;
}): boolean {
  if (amountMicroUsd === 0) {
    return true;
  }
  const totalWeight = entries.reduce((total, { weight }) => total + weight, 0);
  if (totalWeight <= 0) {
    return false;
  }

  for (const { item, weight } of entries) {
    sharesMicroUsd.set(
      item,
      (sharesMicroUsd.get(item) ?? 0) + (amountMicroUsd * weight) / totalWeight
    );
  }
  return true;
}

function groupByRunUsage(
  items: AgentMessageConsumptionItemResource[]
): Map<ModelId, AgentMessageConsumptionItemResource[]> {
  const itemsByRunUsageModelId = new Map<
    ModelId,
    AgentMessageConsumptionItemResource[]
  >();
  for (const item of items) {
    const usageItems = itemsByRunUsageModelId.get(item.runUsageId) ?? [];
    usageItems.push(item);
    itemsByRunUsageModelId.set(item.runUsageId, usageItems);
  }
  return itemsByRunUsageModelId;
}

/**
 * @cc [owner:sfriquet,label:product;backend] tool-result-read-by-next-call
 * A tool row's result input MUST be paid by the first usage, in run creation order, of the run
 * after the run whose usage emitted the tool call. A tool result with no such later run MUST NOT
 * receive any input cost.
 */
function mapUsageToNextCall<TUsage extends RunUsageWithRunKeyType>({
  runs,
  usages,
}: {
  runs: RunResource[];
  usages: TUsage[];
}): Map<ModelId, TUsage> {
  const runByModelId = new Map(runs.map((run) => [run.id, run]));
  const orderedUsages = [...usages].sort(
    (left, right) =>
      (runByModelId.get(left.runModelId)?.createdAt.getTime() ?? 0) -
        (runByModelId.get(right.runModelId)?.createdAt.getTime() ?? 0) ||
      left.runModelId - right.runModelId ||
      left.runUsageModelId - right.runUsageModelId
  );

  const firstUsagesOfRuns = orderedUsages.filter(
    (usage, index) =>
      index === 0 || orderedUsages[index - 1].runModelId !== usage.runModelId
  );
  const nextCallByRunModelId = new Map(
    firstUsagesOfRuns.flatMap((usage, index) => {
      const nextCall = firstUsagesOfRuns[index + 1];
      return nextCall ? [[usage.runModelId, nextCall] as const] : [];
    })
  );

  return new Map(
    orderedUsages.flatMap((usage) => {
      const nextCall = nextCallByRunModelId.get(usage.runModelId);
      return nextCall ? [[usage.runUsageModelId, nextCall] as const] : [];
    })
  );
}

/**
 * @cc [owner:sfriquet,label:product;backend] per-call-cost-split
 * Each usage's recorded cost MUST be split between the items it paid for (see
 * `recorded-cost-split`): the output part across its `output` and `reasoning` rows and the
 * tool-call output of the tool rows it emitted, by output tokens; the input part between the tool
 * results it read and its own `system` and `input` rows. Caches match prompts from their start, so
 * the tool results, which end the prompt, MUST take the usage's uncached tokens first and the
 * cached rate for the rest of their tokens, capped to the prompt.
 */
function splitCallCosts<TUsage extends RunUsageWithRunKeyType>({
  items,
  runs,
  usages,
}: {
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
}): Result<
  Map<AgentMessageConsumptionItemResource, number>,
  ReconciliationFailureCode
> {
  const itemsByRunUsageModelId = groupByRunUsage(items);
  const nextCallByRunUsageModelId = mapUsageToNextCall({ runs, usages });
  const toolResultsByReadingUsageModelId = new Map<ModelId, WeightedItem[]>();
  for (const item of items) {
    const readingUsage = nextCallByRunUsageModelId.get(item.runUsageId);
    if (item.itemType === "tool" && readingUsage) {
      const toolResults =
        toolResultsByReadingUsageModelId.get(readingUsage.runUsageModelId) ??
        [];
      toolResults.push({ item, weight: item.inputTokensCount ?? 0 });
      toolResultsByReadingUsageModelId.set(
        readingUsage.runUsageModelId,
        toolResults
      );
    }
  }

  const sharesMicroUsd = new Map<AgentMessageConsumptionItemResource, number>();
  for (const usage of usages) {
    const usageItems = itemsByRunUsageModelId.get(usage.runUsageModelId) ?? [];
    const recordedCostSplit = splitRecordedUsageCost(usage);
    if (!recordedCostSplit) {
      return new Err("output_exceeds_recorded_cost");
    }
    const { cachedTokenWeight, inputCostMicroUsd, outputCostMicroUsd } =
      recordedCostSplit;

    const toolResults = toolResultsByReadingUsageModelId.get(
      usage.runUsageModelId
    );
    const cachedTokensCount = Math.min(
      usage.cachedTokens ?? 0,
      usage.promptTokens
    );
    const uncachedTokensCount = usage.promptTokens - cachedTokensCount;
    const toolResultTokensCount = Math.min(
      (toolResults ?? []).reduce((total, { weight }) => total + weight, 0),
      usage.promptTokens
    );
    const uncachedToolResultTokensCount = Math.min(
      toolResultTokensCount,
      uncachedTokensCount
    );
    const toolResultWeight =
      uncachedToolResultTokensCount +
      (toolResultTokensCount - uncachedToolResultTokensCount) *
        cachedTokenWeight;
    const promptWeight =
      uncachedTokensCount -
      uncachedToolResultTokensCount +
      (cachedTokensCount -
        (toolResultTokensCount - uncachedToolResultTokensCount)) *
        cachedTokenWeight;
    const toolResultCostMicroUsd =
      toolResultWeight + promptWeight > 0
        ? (inputCostMicroUsd * toolResultWeight) /
          (toolResultWeight + promptWeight)
        : 0;

    const isFullySplit =
      addWeightedShares({
        amountMicroUsd: outputCostMicroUsd,
        entries: usageItems.flatMap((item) =>
          item.itemType === "output" ||
          item.itemType === "reasoning" ||
          item.itemType === "tool"
            ? [{ item, weight: item.outputTokensCount ?? 0 }]
            : []
        ),
        sharesMicroUsd,
      }) &&
      addWeightedShares({
        amountMicroUsd: toolResultCostMicroUsd,
        entries: toolResults ?? [],
        sharesMicroUsd,
      }) &&
      addWeightedShares({
        amountMicroUsd: inputCostMicroUsd - toolResultCostMicroUsd,
        entries: usageItems.flatMap((item) =>
          item.itemType === "system" || item.itemType === "input"
            ? [{ item, weight: Math.max(item.inputTokensCount ?? 0, 1) }]
            : []
        ),
        sharesMicroUsd,
      });
    if (!isFullySplit) {
      return new Err("cost_without_item");
    }
  }

  return new Ok(sharesMicroUsd);
}

/**
 * @cc [owner:sfriquet,label:product;backend] reconcile-to-bill-by-call-cost
 * Every item MUST first receive its exact share of the usages' recorded costs (see
 * `per-call-cost-split`), and reconciliation MUST fail when that is impossible. Tool direct credits
 * MUST keep their stored amounts and MUST NOT exceed the bill. The bill minus direct credits MUST
 * equal, to the micro-credit, the LLM bill that `buildAgentMessageBillingPlan` computes from the
 * usages without origin waivers; reconciliation MUST fail otherwise, so free-origin messages and
 * any unexplained gap fail instead of being absorbed. Only then MUST every other item be scaled by
 * the same factor, which absorbs the per-execution rounding up of the bill, with
 * largest-remainder rounding in item order so the total equals the bill exactly.
 */
function reconcileCreditsByCallCost<TUsage extends RunUsageWithRunKeyType>({
  billedCredits,
  items,
  runs,
  usages,
}: {
  billedCredits: number;
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
}): Result<ReconciledCreditAmounts, ReconciliationFailureCode> {
  const costSharesResult = splitCallCosts({ items, runs, usages });
  if (costSharesResult.isErr()) {
    return costSharesResult;
  }
  const costSharesMicroUsd = costSharesResult.value;

  const directCreditAmountByItem = new Map(
    items.map((item) => [item, item.directCreditAmountMicro ?? 0])
  );
  const llmCreditAmountMicro =
    roundCreditsToMicroCredits(billedCredits) -
    [...directCreditAmountByItem.values()].reduce(
      (total, amount) => total + amount,
      0
    );
  if (llmCreditAmountMicro < 0) {
    return new Err("direct_credits_exceed_bill");
  }
  const expectedLlmCreditAmountMicro = roundCreditsToMicroCredits(
    buildAgentMessageBillingPlan({
      actions: [],
      contextOrigin: null,
      runUsages: usages,
    }).totals.llmBilledCredits
  );
  if (llmCreditAmountMicro !== expectedLlmCreditAmountMicro) {
    return new Err("llm_bill_mismatch");
  }

  const totalCostMicroUsd = [...costSharesMicroUsd.values()].reduce(
    (total, share) => total + share,
    0
  );
  const allocations = items.map((item, index) => {
    const exactMicro =
      totalCostMicroUsd > 0
        ? ((costSharesMicroUsd.get(item) ?? 0) * llmCreditAmountMicro) /
          totalCostMicroUsd
        : 0;
    const floorMicro = Math.floor(exactMicro);
    return {
      item,
      index,
      floorMicro,
      fractionalMicro: exactMicro - floorMicro,
    };
  });
  const remainderMicro =
    llmCreditAmountMicro -
    allocations.reduce((total, { floorMicro }) => total + floorMicro, 0);
  // Largest remainders and then source order keep allocation stable.
  const allocationsReceivingRemainder = new Set(
    [...allocations]
      .sort(
        (left, right) =>
          right.fractionalMicro - left.fractionalMicro ||
          left.index - right.index
      )
      .slice(0, remainderMicro)
      .map(({ item }) => item)
  );

  return new Ok({
    byItem: new Map(
      allocations.map(({ item, floorMicro }) => [
        item,
        (directCreditAmountByItem.get(item) ?? 0) +
          floorMicro +
          (allocationsReceivingRemainder.has(item) ? 1 : 0),
      ])
    ),
  });
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
  hasUnbilledExecution,
}: {
  actions: AgentMCPActionResource[];
  items: AgentMessageConsumptionItemResource[];
  dustRunIdsWithUsage: Set<string>;
  hasUnbilledExecution: boolean;
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
      !hasUnbilledExecution &&
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
  hasUnbilledExecution,
  items,
  runs,
  usages,
}: {
  actions: AgentMCPActionResource[];
  attributionVersion: number;
  billedCredits: number;
  dustRunIds: string[];
  hasUnbilledExecution: boolean;
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
}): Result<MessageConsumptionAllocation<TUsage>, AllocationSkipReason> {
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
      hasUnbilledExecution,
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

  const reconciliationResult = reconcileCreditsByCallCost({
    billedCredits,
    items,
    runs,
    usages: messageUsages,
  });
  if (reconciliationResult.isErr()) {
    return new Err({
      code: reconciliationResult.error,
      context: {
        attributionVersion,
        billedCreditAmountMicro: roundCreditsToMicroCredits(billedCredits),
        directCreditAmountMicro: items.reduce(
          (total, item) => total + (item.directCreditAmountMicro ?? 0),
          0
        ),
        costMicroUsd: messageUsages.reduce(
          (total, usage) => total + usage.costMicroUsd,
          0
        ),
      },
    });
  }
  const reconciledCreditAmounts = reconciliationResult.value;

  return new Ok({
    attributionVersion,
    items,
    messageUsages,
    reconciledCreditAmounts,
  });
}

/** Selects and allocates the newest self-consistent attribution stored for a message. */
/**
 * @cc [owner:sfriquet,label:product;backend] unbilled-execution-tool-completion
 * When `hasUnbilledExecution` is set, a pending tool item whose action has since reached a final
 * status MUST NOT make the attribution incomplete: that completion happened in an execution that
 * was never billed. Without `hasUnbilledExecution`, it MUST make the attribution incomplete.
 */
export function buildLatestMessageConsumptionAllocation<
  TUsage extends RunUsageWithRunKeyType,
>({
  actions,
  billedCredits,
  dustRunIds,
  hasUnbilledExecution,
  items,
  runs,
  usages,
}: {
  actions: AgentMCPActionResource[];
  billedCredits: number | null;
  dustRunIds: string[];
  hasUnbilledExecution: boolean;
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: TUsage[];
}): Result<MessageConsumptionAllocation<TUsage>, AllocationSkipReason> {
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
      hasUnbilledExecution,
      items: itemsByAttributionVersion.get(attributionVersion) ?? [],
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
