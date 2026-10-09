import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { splitRecordedUsageCost } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import type { AgentMessageLlmBillingLine } from "@app/lib/credits/agent_message_billing";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import {
  MICRO_CREDITS_PER_CREDIT,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
import type { AgentMessageConsumptionItemType } from "@app/types/assistant/agent_message_consumption";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const FIRST_ATTRIBUTION_VERSION_WITH_TOOL_ROWS = 2;

export type ReconciledCreditAmounts = {
  byItem: ReadonlyMap<AgentMessageConsumptionItemResource, number>;
};

export type BillingGroupReconciliation<
  TUsage extends RunUsageWithRunKeyType = RunUsageWithRunKeyType,
> = Pick<
  AgentMessageLlmBillingLine<TUsage>,
  "runKey" | "providerId" | "modelId"
> & {
  costCreditMicro: number;
  billedCreditMicro: number;
  roundingCreditMicro: number;
  usages: Array<{ usage: TUsage; billedCreditMicro: number }>;
};

export type MessageConsumptionAllocation<
  TUsage extends RunUsageWithRunKeyType = RunUsageWithRunKeyType,
> = {
  attributionVersion: number;
  billingGroups: BillingGroupReconciliation<TUsage>[];
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

type ItemCreditShare = {
  item: AgentMessageConsumptionItemResource;
  creditMicro: number;
};

function splitByWeight(
  amountCreditMicro: number,
  entries: WeightedItem[]
): ItemCreditShare[] | null {
  if (amountCreditMicro === 0) {
    return [];
  }
  const totalWeight = entries.reduce((total, { weight }) => total + weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  return entries.map(({ item, weight }) => ({
    item,
    creditMicro: (amountCreditMicro * weight) / totalWeight,
  }));
}

function ownCallCostPart(
  itemType: AgentMessageConsumptionItemType
): "output" | "input" | null {
  switch (itemType) {
    case "output":
    case "reasoning":
    case "tool":
      return "output";
    case "system":
    case "input":
      return "input";
    case "rounding":
      return null;
    default:
      return assertNever(itemType);
  }
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
 * @cc [owner:sfriquet,label:product;backend] one-run-order
 * Deciding which LLM call read a tool result, and which tool results no call read, MUST order the
 * message's runs with this comparator.
 */
export function compareRunsChronologically(
  left: Pick<RunResource, "createdAt" | "id">,
  right: Pick<RunResource, "createdAt" | "id">
): number {
  return (
    left.createdAt.getTime() - right.createdAt.getTime() || left.id - right.id
  );
}

/**
 * @cc [owner:sfriquet,label:product;backend] tool-result-paid-by-next-call
 * A tool result MUST only be charged when a later LLM call of the message read it, and only from
 * that call's input cost.
 */
function mapUsageToNextCall<TUsage extends RunUsageWithRunKeyType>({
  runs,
  usages,
}: {
  runs: RunResource[];
  usages: TUsage[];
}): Map<ModelId, TUsage> {
  const runIndexByModelId = new Map(
    [...runs]
      .sort(compareRunsChronologically)
      .map((run, index) => [run.id, index])
  );
  const orderedUsages = [...usages].sort(
    (left, right) =>
      (runIndexByModelId.get(left.runModelId) ?? -1) -
        (runIndexByModelId.get(right.runModelId) ?? -1) ||
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
 * @cc [owner:sfriquet,label:product;backend] call-pays-its-own-rows
 * An LLM call's credits MUST only go to what that call paid for: its output, its reasoning, the tool
 * calls it emitted, its prompt, and the tool results it read.
 */
/**
 * @cc [owner:sfriquet,label:product;backend] tool-result-at-paid-price
 * A tool result MUST be charged at the price its reading call paid for its tokens: the cache read
 * price for tokens read from the provider's cache, and the cache write price for tokens written to
 * it.
 */
function splitBilledCreditsByCallCost<TUsage extends RunUsageWithRunKeyType>({
  billedCreditMicroByRunUsageModelId,
  items,
  runs,
  usages,
}: {
  billedCreditMicroByRunUsageModelId: ReadonlyMap<ModelId, number>;
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

  const shares: ItemCreditShare[] = [];
  for (const usage of usages) {
    const usageItems = itemsByRunUsageModelId.get(usage.runUsageModelId) ?? [];
    const recordedCostSplit = splitRecordedUsageCost(usage);
    if (!recordedCostSplit) {
      return new Err("output_exceeds_recorded_cost");
    }
    const {
      cacheWriteTokenWeight,
      cachedTokenWeight,
      inputCostMicroUsd,
      outputCostMicroUsd,
    } = recordedCostSplit;
    const billedCreditMicro =
      billedCreditMicroByRunUsageModelId.get(usage.runUsageModelId) ?? 0;
    const splitCostMicroUsd = outputCostMicroUsd + inputCostMicroUsd;
    if (splitCostMicroUsd === 0) {
      if (billedCreditMicro > 0) {
        return new Err("cost_without_item");
      }
      continue;
    }
    const creditMicroPerMicroUsd = billedCreditMicro / splitCostMicroUsd;

    const toolResults = toolResultsByReadingUsageModelId.get(
      usage.runUsageModelId
    );
    const cachedTokensCount = Math.min(
      usage.cachedTokens ?? 0,
      usage.promptTokens
    );
    const cacheWriteTokensCount = Math.min(
      usage.cacheCreationTokens ?? 0,
      usage.promptTokens - cachedTokensCount
    );
    const promptSegmentsFromEnd = [
      {
        tokensCount:
          usage.promptTokens - cachedTokensCount - cacheWriteTokensCount,
        weight: 1,
      },
      { tokensCount: cacheWriteTokensCount, weight: cacheWriteTokenWeight },
      { tokensCount: cachedTokensCount, weight: cachedTokenWeight },
    ];
    let toolResultTokensLeft = Math.min(
      (toolResults ?? []).reduce((total, { weight }) => total + weight, 0),
      usage.promptTokens
    );
    let toolResultWeight = 0;
    let promptWeight = 0;
    for (const { tokensCount, weight } of promptSegmentsFromEnd) {
      const toolResultTokensCount = Math.min(toolResultTokensLeft, tokensCount);
      toolResultWeight += toolResultTokensCount * weight;
      promptWeight += (tokensCount - toolResultTokensCount) * weight;
      toolResultTokensLeft -= toolResultTokensCount;
    }
    const toolResultCostMicroUsd =
      toolResultWeight + promptWeight > 0
        ? (inputCostMicroUsd * toolResultWeight) /
          (toolResultWeight + promptWeight)
        : 0;

    const usageShares = [
      splitByWeight(
        outputCostMicroUsd * creditMicroPerMicroUsd,
        usageItems.flatMap((item) =>
          ownCallCostPart(item.itemType) === "output"
            ? [{ item, weight: item.outputTokensCount ?? 0 }]
            : []
        )
      ),
      splitByWeight(
        toolResultCostMicroUsd * creditMicroPerMicroUsd,
        toolResults ?? []
      ),
      splitByWeight(
        (inputCostMicroUsd - toolResultCostMicroUsd) * creditMicroPerMicroUsd,
        usageItems.flatMap((item) =>
          ownCallCostPart(item.itemType) === "input"
            ? [{ item, weight: Math.max(item.inputTokensCount ?? 0, 1) }]
            : []
        )
      ),
    ];
    for (const usageShare of usageShares) {
      if (!usageShare) {
        return new Err("cost_without_item");
      }
      shares.push(...usageShare);
    }
  }

  const creditMicroByItem = new Map<
    AgentMessageConsumptionItemResource,
    number
  >();
  for (const { item, creditMicro } of shares) {
    creditMicroByItem.set(
      item,
      (creditMicroByItem.get(item) ?? 0) + creditMicro
    );
  }
  return new Ok(creditMicroByItem);
}

function buildBillingGroupReconciliations<
  TUsage extends RunUsageWithRunKeyType,
>(
  llmBillingLines: AgentMessageLlmBillingLine<TUsage>[]
): BillingGroupReconciliation<TUsage>[] {
  return llmBillingLines.map((line) => {
    const costCreditMicro =
      (line.providerCostMicroUsd * MICRO_CREDITS_PER_CREDIT) /
      MODEL_COST_MICRO_USD_PER_AWU_CREDIT;
    const billedCreditMicro = roundCreditsToMicroCredits(line.billedCredits);
    return {
      runKey: line.runKey,
      providerId: line.providerId,
      modelId: line.modelId,
      costCreditMicro,
      billedCreditMicro,
      roundingCreditMicro: billedCreditMicro - costCreditMicro,
      usages: (line.usageAllocations ?? []).map(
        ({ usage, allocatedBilledCreditMicro }) => ({
          usage,
          billedCreditMicro: allocatedBilledCreditMicro,
        })
      ),
    };
  });
}

/**
 * @cc [owner:sfriquet,label:product;backend] tool-fee-as-billed
 * A tool's fee MUST be attributed to that tool exactly as billed.
 */
/**
 * @cc [owner:sfriquet,label:product;backend] rounding-stays-in-its-group
 * The rounding up of a billing group (one execution and model) MUST only be spread over the rows
 * paid by that group's LLM calls, in proportion to their cost.
 */
/**
 * @cc [owner:sfriquet,label:product;backend] credits-add-up-to-bill
 * The attributed credits MUST add up exactly to the message's bill. When the bill differs from its
 * tool fees plus its LLM calls' rounded-up cost, attribution MUST fail instead of absorbing the gap.
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
}): Result<
  {
    billingGroups: BillingGroupReconciliation<TUsage>[];
    reconciledCreditAmounts: ReconciledCreditAmounts;
  },
  ReconciliationFailureCode
> {
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
  const llmBillingPlan = buildAgentMessageBillingPlan({
    actions: [],
    contextOrigin: null,
    getUsageAllocationKey: (usage) => String(usage.runUsageModelId),
    runUsages: usages,
  });
  if (
    llmCreditAmountMicro !==
    roundCreditsToMicroCredits(llmBillingPlan.totals.llmBilledCredits)
  ) {
    return new Err("llm_bill_mismatch");
  }
  const billingGroups = buildBillingGroupReconciliations(llmBillingPlan.llm);

  const creditMicroByItemResult = splitBilledCreditsByCallCost({
    billedCreditMicroByRunUsageModelId: new Map(
      billingGroups.flatMap(({ usages: groupUsages }) =>
        groupUsages.map(
          ({ usage, billedCreditMicro }) =>
            [usage.runUsageModelId, billedCreditMicro] as const
        )
      )
    ),
    items,
    runs,
    usages,
  });
  if (creditMicroByItemResult.isErr()) {
    return creditMicroByItemResult;
  }
  const creditMicroByItem = creditMicroByItemResult.value;

  const allocations = items.map((item, index) => {
    const exactMicro = creditMicroByItem.get(item) ?? 0;
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
    billingGroups,
    reconciledCreditAmounts: {
      byItem: new Map(
        allocations.map(({ item, floorMicro }) => [
          item,
          (directCreditAmountByItem.get(item) ?? 0) +
            floorMicro +
            (allocationsReceivingRemainder.has(item) ? 1 : 0),
        ])
      ),
    },
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
  const { billingGroups, reconciledCreditAmounts } = reconciliationResult.value;

  return new Ok({
    attributionVersion,
    billingGroups,
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
