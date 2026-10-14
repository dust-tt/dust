/**
 * Explains how an agent message's bill is reconciled across its consumption items, step by step,
 * or where the reconciliation fails.
 *
 * This script is read-only.
 *
 * npx tsx scripts/debug_agent_message_consumption_allocation.ts \
 *   --workspaceId 8DpNy5tEUG \
 *   --agentMessageId Ut5LbnRe3M \
 *   --execute
 */

import {
  allocateUsageCredits,
  buildLatestMessageConsumptionAllocation,
  compareRunsChronologically,
  groupToolResultsByReadingUsage,
  toolResultShareOfInputCost,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  getCachedTokenPriceRatios,
  splitRecordedCostIntoInputAndOutput,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { Authenticator } from "@app/lib/auth";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import {
  MICRO_CREDITS_PER_CREDIT,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";

const MIN_CACHE_WARMED_BY_UNBILLED_REQUEST_TOKENS = 1_024;

function credits(creditMicro: number | null | undefined): number | "n/a" {
  return creditMicro === null || creditMicro === undefined
    ? "n/a"
    : Math.round(creditMicro) / MICRO_CREDITS_PER_CREDIT;
}

function creditMicroFromCostMicroUsd(costMicroUsd: number): number {
  return (
    (costMicroUsd * MICRO_CREDITS_PER_CREDIT) /
    MODEL_COST_MICRO_USD_PER_AWU_CREDIT
  );
}

function sumCreditMicro(
  items: AgentMessageConsumptionItemResource[],
  creditMicroOf: (item: AgentMessageConsumptionItemResource) => number
): number {
  return items.reduce((total, item) => total + creditMicroOf(item), 0);
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId.",
    },
    agentMessageId: {
      type: "string",
      demandOption: true,
      description: "Agent message sId.",
    },
  },
  async ({ agentMessageId, execute, workspaceId }) => {
    if (!execute) {
      console.log("Read-only diagnostic. Pass --execute to run it.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (!creditContext) {
      throw new Error(`Agent message ${agentMessageId} was not found.`);
    }

    const billedCredits = creditContext.previousCostCredits;
    const dustRunIds = [...new Set(creditContext.runIds ?? [])];
    const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
    const usages = await RunResource.listRunUsagesForRuns(auth, {
      includeUnavailable: true,
      runs,
    });
    const [actions, items] = await Promise.all([
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        creditContext.agentMessageModelId,
      ]),
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [creditContext.agentMessageModelId],
        maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      }),
    ]);

    const allocationResult = buildLatestMessageConsumptionAllocation({
      actions,
      billedCredits,
      dustRunIds,
      items,
      runs,
      usages,
    });

    console.log("\nResult");
    console.table([
      {
        agentMessageId,
        status: creditContext.status,
        origin: creditContext.triggeringUserMessageOrigin ?? "none",
        billedCredits: billedCredits ?? "none",
        result: allocationResult.isOk()
          ? "reconciled"
          : allocationResult.error.code,
        attributionVersion: allocationResult.isOk()
          ? allocationResult.value.attributionVersion
          : "n/a",
        ...(allocationResult.isErr() ? allocationResult.error.context : {}),
      },
    ]);

    const attributionVersions = [
      ...new Set(items.map(({ attributionVersion }) => attributionVersion)),
    ].sort((left, right) => right - left);
    console.log("\nStored attribution versions, newest first");
    console.table(
      attributionVersions.map((attributionVersion) => {
        const versionItems = items.filter(
          (item) => item.attributionVersion === attributionVersion
        );
        const versionResult = buildLatestMessageConsumptionAllocation({
          actions,
          billedCredits,
          dustRunIds,
          items: versionItems,
          runs,
          usages,
        });
        return {
          attributionVersion,
          items: versionItems.length,
          result: versionResult.isOk()
            ? "reconciled"
            : versionResult.error.code,
        };
      })
    );

    const reportedItems = allocationResult.isOk()
      ? allocationResult.value.items
      : items.filter(
          (item) => item.attributionVersion === attributionVersions[0]
        );
    const reconciledCreditMicroByItem = allocationResult.isOk()
      ? allocationResult.value.reconciledCreditAmounts.byItem
      : null;

    const toolFeesCreditMicro = sumCreditMicro(
      reportedItems,
      (item) => item.directCreditAmountMicro ?? 0
    );
    const llmBillingPlan = buildAgentMessageBillingPlan({
      actions: [],
      contextOrigin: null,
      getUsageAllocationKey: (usage) => String(usage.runUsageModelId),
      runUsages: usages,
    });
    const chargedLlmBilledCredits = buildAgentMessageBillingPlan({
      actions: [],
      contextOrigin: creditContext.triggeringUserMessageOrigin,
      runUsages: usages,
    }).totals.llmBilledCredits;
    const llmBilledCreditMicro =
      billedCredits === null
        ? null
        : roundCreditsToMicroCredits(billedCredits) - toolFeesCreditMicro;
    const recomputedLlmBilledCreditMicro = roundCreditsToMicroCredits(
      llmBillingPlan.totals.llmBilledCredits
    );

    console.log("\nStep 1: the LLM part of the bill must match its usages");
    console.table([
      {
        quantity: "bill",
        credits: billedCredits ?? "n/a",
        meaning: "What the message was charged",
      },
      {
        quantity: "tool_fees",
        credits: credits(toolFeesCreditMicro),
        meaning: "Direct credits of the tool items, kept as billed",
      },
      {
        quantity: "llm_bill",
        credits: credits(llmBilledCreditMicro),
        meaning: "Bill minus tool fees, to split across the LLM usages",
      },
      {
        quantity: "llm_bill_from_usages",
        credits: credits(recomputedLlmBilledCreditMicro),
        meaning:
          "Recorded cost of each billing group rounded up, before any free-origin waiver",
      },
      {
        quantity: "llm_bill_charged_from_usages",
        credits: chargedLlmBilledCredits,
        meaning: "Same, after the free-origin waiver (0 for free origins)",
      },
    ]);

    console.log("\nStep 2: each billing group's bill is shared by its usages");
    console.table(
      llmBillingPlan.llm.map((line) => {
        const costCreditMicro = creditMicroFromCostMicroUsd(
          line.providerCostMicroUsd
        );
        const billedCreditMicro = roundCreditsToMicroCredits(
          line.billedCredits
        );
        return {
          runKey: line.runKey,
          provider: line.providerId,
          model: line.modelId,
          usages: line.usageAllocations?.length ?? 0,
          recordedCostCredits: credits(costCreditMicro),
          billedCredits: credits(billedCreditMicro),
          roundingCredits: credits(billedCreditMicro - costCreditMicro),
        };
      })
    );

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
    const usageNumberByRunUsageModelId = new Map(
      orderedUsages.map((usage, index) => [usage.runUsageModelId, index + 1])
    );
    const usageBilledCreditMicroByRunUsageModelId = new Map(
      llmBillingPlan.llm.flatMap((line) =>
        (line.usageAllocations ?? []).map(
          ({ usage, allocatedBilledCreditMicro }) =>
            [usage.runUsageModelId, allocatedBilledCreditMicro] as const
        )
      )
    );
    const toolResultsByReadingUsage = groupToolResultsByReadingUsage({
      items: reportedItems,
      runs,
      usages,
    });
    const readingRunUsageModelIdByItem = new Map<
      AgentMessageConsumptionItemResource,
      ModelId
    >(
      [...toolResultsByReadingUsage].flatMap(
        ([readingRunUsageModelId, toolResults]) =>
          toolResults.map(({ item }) => [item, readingRunUsageModelId] as const)
      )
    );

    const usageRows = orderedUsages.map((usage, index) => {
      const costSplit = splitRecordedCostIntoInputAndOutput(usage);
      const toolResults =
        toolResultsByReadingUsage.get(usage.runUsageModelId) ?? [];
      const toolResultTokensCount = toolResults.reduce(
        (total, { tokensCount }) => total + tokensCount,
        0
      );
      const toolResultCostMicroUsd = costSplit.isOk()
        ? costSplit.value.inputCostMicroUsd *
          toolResultShareOfInputCost({
            usage,
            toolResultTokensCount,
            priceRatios: getCachedTokenPriceRatios(usage),
          })
        : null;
      const previousUsage = orderedUsages[index - 1];
      const cachedTokensBeyondPreviousUsage =
        previousUsage && previousUsage.runModelId !== usage.runModelId
          ? (usage.cachedTokens ?? 0) -
            (previousUsage.promptTokens + previousUsage.completionTokens)
          : null;
      return {
        usage,
        costSplit,
        toolResultTokensCount,
        toolResultCostMicroUsd,
        cachedTokensBeyondPreviousUsage,
        billedCreditMicro: usageBilledCreditMicroByRunUsageModelId.get(
          usage.runUsageModelId
        ),
      };
    });

    console.log(
      "\nStep 3: each usage's recorded cost splits into output, tool results read, and prompt"
    );
    console.table(
      usageRows.map(
        ({
          usage,
          costSplit,
          toolResultTokensCount,
          toolResultCostMicroUsd,
          cachedTokensBeyondPreviousUsage,
        }) => ({
          usage: usageNumberByRunUsageModelId.get(usage.runUsageModelId),
          runUsageId: usage.runUsageModelId,
          runKey: usage.runKey ?? "none",
          model: usage.modelId,
          promptTokens: usage.promptTokens,
          cachedTokens: usage.cachedTokens ?? 0,
          cacheWriteTokens: usage.cacheCreationTokens ?? 0,
          completionTokens: usage.completionTokens,
          toolResultTokensRead: toolResultTokensCount,
          cacheWarmedByUnbilledRequest:
            cachedTokensBeyondPreviousUsage !== null &&
            cachedTokensBeyondPreviousUsage >
              MIN_CACHE_WARMED_BY_UNBILLED_REQUEST_TOKENS,
          recordedCostCredits: credits(
            creditMicroFromCostMicroUsd(usage.costMicroUsd)
          ),
          outputCostCredits: costSplit.isOk()
            ? credits(
                creditMicroFromCostMicroUsd(costSplit.value.outputCostMicroUsd)
              )
            : costSplit.error,
          toolResultCostCredits:
            toolResultCostMicroUsd === null
              ? "n/a"
              : credits(creditMicroFromCostMicroUsd(toolResultCostMicroUsd)),
          promptCostCredits:
            costSplit.isOk() && toolResultCostMicroUsd !== null
              ? credits(
                  creditMicroFromCostMicroUsd(
                    costSplit.value.inputCostMicroUsd - toolResultCostMicroUsd
                  )
                )
              : "n/a",
        })
      )
    );

    console.log(
      "\nStep 4: each usage's billed share is split in proportion to those costs"
    );
    console.table(
      usageRows.map(
        ({ usage, costSplit, toolResultCostMicroUsd, billedCreditMicro }) => {
          const costMicroUsd = costSplit.isOk()
            ? costSplit.value.inputCostMicroUsd +
              costSplit.value.outputCostMicroUsd
            : 0;
          const creditMicroOf = (partCostMicroUsd: number) =>
            costMicroUsd > 0 && billedCreditMicro !== undefined
              ? credits((partCostMicroUsd * billedCreditMicro) / costMicroUsd)
              : "n/a";
          return {
            usage: usageNumberByRunUsageModelId.get(usage.runUsageModelId),
            billedCredits: credits(billedCreditMicro),
            billedOverRecordedCost:
              costMicroUsd > 0 && billedCreditMicro !== undefined
                ? Math.round(
                    (billedCreditMicro /
                      creditMicroFromCostMicroUsd(costMicroUsd)) *
                      10_000
                  ) / 10_000
                : "n/a",
            outputCredits: costSplit.isOk()
              ? creditMicroOf(costSplit.value.outputCostMicroUsd)
              : "n/a",
            toolResultCredits:
              toolResultCostMicroUsd === null
                ? "n/a"
                : creditMicroOf(toolResultCostMicroUsd),
            promptCredits:
              costSplit.isOk() && toolResultCostMicroUsd !== null
                ? creditMicroOf(
                    costSplit.value.inputCostMicroUsd - toolResultCostMicroUsd
                  )
                : "n/a",
          };
        }
      )
    );

    const itemsByRunUsageModelId = new Map<
      ModelId,
      AgentMessageConsumptionItemResource[]
    >();
    for (const item of reportedItems) {
      const usageItems = itemsByRunUsageModelId.get(item.runUsageId) ?? [];
      usageItems.push(item);
      itemsByRunUsageModelId.set(item.runUsageId, usageItems);
    }
    let creditMicroBeforeRoundingByItem: Map<
      AgentMessageConsumptionItemResource,
      number
    > | null = new Map(
      reportedItems.map((item) => [item, item.directCreditAmountMicro ?? 0])
    );
    for (const usage of usages) {
      const sharesResult = allocateUsageCredits({
        usage,
        billedCreditMicro: Math.round(
          creditMicroFromCostMicroUsd(usage.costMicroUsd)
        ),
        usageItems: itemsByRunUsageModelId.get(usage.runUsageModelId) ?? [],
        toolResults: toolResultsByReadingUsage.get(usage.runUsageModelId) ?? [],
      });
      if (sharesResult.isErr()) {
        creditMicroBeforeRoundingByItem = null;
        break;
      }
      for (const { item, creditMicro } of sharesResult.value) {
        creditMicroBeforeRoundingByItem.set(
          item,
          (creditMicroBeforeRoundingByItem.get(item) ?? 0) + creditMicro
        );
      }
    }

    const actionSIdByModelId = new Map(
      actions.map((action) => [action.id, action.sId])
    );
    console.log(
      "\nStep 5: items receive their usages' shares, plus their tool fees (before rounding: each usage shares its recorded cost instead of its billed share)"
    );
    console.table(
      reportedItems.map((item) => {
        const readingRunUsageModelId = readingRunUsageModelIdByItem.get(item);
        return {
          itemId: item.id,
          type: item.itemType,
          version: item.attributionVersion,
          action:
            item.agentMCPActionId === null
              ? "n/a"
              : (actionSIdByModelId.get(item.agentMCPActionId) ?? "n/a"),
          usage: usageNumberByRunUsageModelId.get(item.runUsageId) ?? "n/a",
          resultReadByUsage:
            readingRunUsageModelId === undefined
              ? "n/a"
              : (usageNumberByRunUsageModelId.get(readingRunUsageModelId) ??
                "n/a"),
          inputTokens: item.inputTokensCount ?? "n/a",
          outputTokens: item.outputTokensCount ?? "n/a",
          grossCredits: credits(item.grossAttributedCreditAmountMicro),
          toolFeeCredits: credits(item.directCreditAmountMicro),
          reconciledCreditsBeforeRounding: credits(
            creditMicroBeforeRoundingByItem?.get(item)
          ),
          reconciledCredits: credits(reconciledCreditMicroByItem?.get(item)),
        };
      })
    );

    console.log("\nTotal");
    console.table([
      {
        bill: billedCredits ?? "n/a",
        reconciledCreditsBeforeRounding: creditMicroBeforeRoundingByItem
          ? credits(
              sumCreditMicro(
                reportedItems,
                (item) => creditMicroBeforeRoundingByItem?.get(item) ?? 0
              )
            )
          : "n/a",
        reconciledCredits: reconciledCreditMicroByItem
          ? credits(
              sumCreditMicro(
                reportedItems,
                (item) => reconciledCreditMicroByItem.get(item) ?? 0
              )
            )
          : "n/a",
      },
    ]);
  }
);
