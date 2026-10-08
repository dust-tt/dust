import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { buildToolResultInputCreditAmountMicro } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
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

export type AllocationSkipReason = {
  code:
    | "no_billed_credits"
    | "no_items_or_dust_run_ids"
    | "no_message_usages"
    | "incomplete_attribution"
    | "reconciliation_failed";
  context: Record<string, number | boolean>;
};

const MIN_WARMED_TOOL_RESULT_SHARE = 0.5;

type RetriedCall = {
  dustRunId: string;
  previousKeptDustRunId: string | null;
};

/**
 * @cc [owner:sfriquet,label:product;backend] retried-call-detection
 * A kept LLM call (in `dustRunIds`) is a retry when `attemptedRunIds` lists at least one attempt
 * that is not in `dustRunIds` before it and after the previous kept call, or after the start of
 * `attemptedRunIds` when it is the first kept call. Every retry MUST be returned with its previous
 * kept call, `null` for the first kept call. Without `attemptedRunIds`, no call is a retry.
 */
function listRetriedCalls({
  attemptedRunIds,
  dustRunIds,
}: {
  attemptedRunIds: string[] | null;
  dustRunIds: ReadonlySet<string>;
}): RetriedCall[] {
  const retriedCalls: RetriedCall[] = [];
  let previousKeptDustRunId: string | null = null;
  let hasLostAttemptSincePreviousKept = false;

  for (const dustRunId of attemptedRunIds ?? []) {
    if (!dustRunIds.has(dustRunId)) {
      hasLostAttemptSincePreviousKept = true;
      continue;
    }
    if (hasLostAttemptSincePreviousKept) {
      retriedCalls.push({ dustRunId, previousKeptDustRunId });
    }
    previousKeptDustRunId = dustRunId;
    hasLostAttemptSincePreviousKept = false;
  }

  return retriedCalls;
}

/**
 * @cc [owner:sfriquet,label:product;backend] cache-warmed-by-unbilled-attempt
 * A retried call's cache counts as warmed by an unbilled attempt only when its `cachedTokens`
 * exceed the most its previous kept call could have cached (`promptTokens + completionTokens`) by
 * at least half of `toolResultTokensCount`, the tool result tokens produced by the previous kept
 * call. Usages of one run are summed. With no tool result tokens, the cache never counts as warmed.
 */
function isCacheWarmedByUnbilledAttempt({
  previousUsages,
  retriedUsages,
  toolResultTokensCount,
}: {
  previousUsages: RunUsageWithRunKeyType[];
  retriedUsages: RunUsageWithRunKeyType[];
  toolResultTokensCount: number;
}): boolean {
  if (toolResultTokensCount === 0) {
    return false;
  }

  const previouslyCacheableTokensCount = previousUsages.reduce(
    (total, usage) => total + usage.promptTokens + usage.completionTokens,
    0
  );
  const retriedCachedTokensCount = retriedUsages.reduce(
    (total, usage) => total + (usage.cachedTokens ?? 0),
    0
  );

  return (
    retriedCachedTokensCount - previouslyCacheableTokensCount >=
    toolResultTokensCount * MIN_WARMED_TOOL_RESULT_SHARE
  );
}

/**
 * @cc [owner:sfriquet,label:product;backend] relax-tool-input-after-retry
 * A tool row MUST NOT protect its result input credits when its result was consumed by a retried
 * call whose cache was warmed by an unbilled attempt: that attempt paid the input first, and the
 * billed retry read it from the provider cache. A call consumes the results of the tools emitted by
 * its previous kept call, so a retry without a previous kept call consumes none. That input portion
 * MUST be reconciled with the `input` rows, and the row MUST keep its direct and tool-call output
 * credits. Every other tool row MUST keep its gross credits.
 */
function buildRelaxedToolInputCreditAmountByItem({
  attemptedRunIds,
  dustRunIds,
  items,
  runs,
  usages,
}: {
  attemptedRunIds: string[] | null;
  dustRunIds: ReadonlySet<string>;
  items: AgentMessageConsumptionItemResource[];
  runs: RunResource[];
  usages: RunUsageWithRunKeyType[];
}): Map<AgentMessageConsumptionItemResource, number> {
  const retriedCalls = listRetriedCalls({ attemptedRunIds, dustRunIds });
  if (retriedCalls.length === 0) {
    return new Map();
  }

  const dustRunIdByRunModelId = new Map(
    runs.map((run) => [run.id, run.dustRunId])
  );
  const usagesByDustRunId = new Map<string, RunUsageWithRunKeyType[]>();
  for (const usage of usages) {
    const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
    if (dustRunId !== undefined) {
      usagesByDustRunId.set(dustRunId, [
        ...(usagesByDustRunId.get(dustRunId) ?? []),
        usage,
      ]);
    }
  }
  const usageByRunUsageModelId = new Map(
    usages.map((usage) => [usage.runUsageModelId, usage])
  );
  const toolItemsByDustRunId = new Map<
    string,
    {
      item: AgentMessageConsumptionItemResource;
      inputTokensCount: number;
      usage: RunUsageWithRunKeyType;
    }[]
  >();
  for (const item of items) {
    const usage = usageByRunUsageModelId.get(item.runUsageId);
    const dustRunId = usage
      ? dustRunIdByRunModelId.get(usage.runModelId)
      : undefined;
    if (
      item.itemType === "tool" &&
      item.inputTokensCount !== null &&
      usage &&
      dustRunId !== undefined
    ) {
      toolItemsByDustRunId.set(dustRunId, [
        ...(toolItemsByDustRunId.get(dustRunId) ?? []),
        { item, inputTokensCount: item.inputTokensCount, usage },
      ]);
    }
  }

  return new Map(
    retriedCalls.flatMap(({ dustRunId, previousKeptDustRunId }) => {
      if (previousKeptDustRunId === null) {
        return [];
      }

      const toolItems = toolItemsByDustRunId.get(previousKeptDustRunId) ?? [];
      const isWarmed = isCacheWarmedByUnbilledAttempt({
        previousUsages: usagesByDustRunId.get(previousKeptDustRunId) ?? [],
        retriedUsages: usagesByDustRunId.get(dustRunId) ?? [],
        toolResultTokensCount: toolItems.reduce(
          (total, { inputTokensCount }) => total + inputTokensCount,
          0
        ),
      });
      if (!isWarmed) {
        return [];
      }

      return toolItems.flatMap(({ item, inputTokensCount, usage }) => {
        const inputCreditAmountMicro = Math.min(
          buildToolResultInputCreditAmountMicro({ usage, inputTokensCount }),
          item.grossAttributedCreditAmountMicro -
            (item.directCreditAmountMicro ?? 0)
        );
        return inputCreditAmountMicro > 0
          ? [[item, inputCreditAmountMicro] as const]
          : [];
      });
    })
  );
}

/**
 * Makes the attribution additive with the authoritative bill without changing stored evidence.
 *
 * Tool rows represent the causal first-use cost of emitting a tool call and carrying its new
 * result into the next model input, so non-input attribution is kept unchanged, except for the
 * result input of tool rows consumed by a retried call whose cache an unbilled attempt warmed
 * (see `relax-tool-input-after-retry`). The model's ordinary `input` bucket contains reused
 * conversation context, so it is the reconciliation seam. Input rows and relaxed tool inputs share
 * the reconciled remainder in proportion to their gross cost, using deterministic integer
 * microcredit rounding.
 */
function reconcileInputCredits({
  items,
  billedCredits,
  relaxedToolInputCreditAmountByItem,
}: {
  items: AgentMessageConsumptionItemResource[];
  billedCredits: number;
  relaxedToolInputCreditAmountByItem: ReadonlyMap<
    AgentMessageConsumptionItemResource,
    number
  >;
}): ReconciledCreditAmounts | null {
  const billedCreditAmountMicro = roundCreditsToMicroCredits(billedCredits);
  const reconciledShares = items.flatMap((item) => {
    if (item.itemType === "input") {
      return [
        {
          item,
          baseMicro: 0,
          grossShareMicro: item.grossAttributedCreditAmountMicro,
        },
      ];
    }
    const relaxedInputCreditAmountMicro =
      relaxedToolInputCreditAmountByItem.get(item);
    return relaxedInputCreditAmountMicro === undefined
      ? []
      : [
          {
            item,
            baseMicro:
              item.grossAttributedCreditAmountMicro -
              relaxedInputCreditAmountMicro,
            grossShareMicro: relaxedInputCreditAmountMicro,
          },
        ];
  });
  const protectedCreditAmountMicro = items.reduce(
    (total, item) =>
      item.itemType === "input"
        ? total
        : total +
          item.grossAttributedCreditAmountMicro -
          (relaxedToolInputCreditAmountByItem.get(item) ?? 0),
    0
  );
  const reconciledInputCreditAmountMicro =
    billedCreditAmountMicro - protectedCreditAmountMicro;
  if (reconciledInputCreditAmountMicro < 0) {
    return null;
  }

  const grossInputCreditAmountMicro = reconciledShares.reduce(
    (total, share) => total + share.grossShareMicro,
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

  const inputAllocations = reconciledShares.map((share, index) => {
    const inputShare = share.grossShareMicro / grossInputCreditAmountMicro;
    const exactMicro = inputShare * reconciledInputCreditAmountMicro;
    const floorMicro = Math.floor(exactMicro);

    return {
      ...share,
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
    inputAllocations.map(({ item, baseMicro, floorMicro }) => [
      item,
      baseMicro +
        floorMicro +
        (allocationsReceivingRemainder.has(item) ? 1 : 0),
    ])
  );

  return {
    byItem: new Map(
      items.map((item) => [
        item,
        reconciledInputCreditAmountByItem.get(item) ??
          (item.itemType === "input"
            ? 0
            : item.grossAttributedCreditAmountMicro),
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
  attemptedRunIds,
  attributionVersion,
  billedCredits,
  dustRunIds,
  hasUnbilledExecution,
  items,
  runs,
  usages,
}: {
  actions: AgentMCPActionResource[];
  attemptedRunIds: string[] | null;
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

  const relaxedToolInputCreditAmountByItem =
    buildRelaxedToolInputCreditAmountByItem({
      attemptedRunIds,
      dustRunIds: dustRunIdSet,
      items,
      runs,
      usages: messageUsages,
    });
  const reconciledCreditAmounts = reconcileInputCredits({
    items,
    billedCredits,
    relaxedToolInputCreditAmountByItem,
  });
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
        relaxedToolItemCount: relaxedToolInputCreditAmountByItem.size,
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
  attemptedRunIds,
  billedCredits,
  dustRunIds,
  hasUnbilledExecution,
  items,
  runs,
  usages,
}: {
  actions: AgentMCPActionResource[];
  attemptedRunIds: string[] | null;
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
      attemptedRunIds,
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
