import { buildLlmConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/llm_documents";
import type {
  AgentMessageConsumptionAnalyticsInput,
  BilledRunUsage,
} from "@app/lib/analytics/agent_message_consumption/load";
import { buildToolConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/tool_documents";
import type { MessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

export type ConsumptionDocumentsSkipReason =
  | {
      code: "credit_mismatch";
      context: {
        attributionVersion: number;
        indexedCreditMicro: number;
        reconciledCreditMicro: number;
        documentCount: number;
      };
    }
  | {
      code: "empty_documents";
      context: Record<string, never>;
    };

// The analytics activity only indexes the outcome of the attribution activity that ran before it:
// the items of the newest attribution version, at their stored reconciled amounts. New usages,
// actions or a new bill can land between the two activities, so nothing is re-derived here from
// the message's current state. Current usages and actions only provide metadata for the items.
function readReconciledConsumption(
  input: AgentMessageConsumptionAnalyticsInput
): MessageConsumptionAllocation<BilledRunUsage> | null {
  if (input.items.length === 0) {
    return null;
  }

  const attributionVersion = Math.max(
    ...input.items.map((item) => item.attributionVersion)
  );
  const latestItems = input.items.filter(
    (item) => item.attributionVersion === attributionVersion
  );
  const reconciledCreditMicroByItem = new Map(
    latestItems.flatMap((item) =>
      item.reconciledCreditAmountMicro === null
        ? []
        : [[item, item.reconciledCreditAmountMicro] as const]
    )
  );
  if (reconciledCreditMicroByItem.size === 0) {
    return null;
  }
  // A successful attribution pass reconciles every item of its version in one transaction.
  assert(
    reconciledCreditMicroByItem.size === latestItems.length,
    "Only part of the newest attribution version is reconciled"
  );

  const items = [...reconciledCreditMicroByItem.keys()];
  const runUsageModelIds = new Set(items.map((item) => item.runUsageId));

  return {
    attributionVersion,
    items,
    messageUsages: input.usages.filter((usage) =>
      runUsageModelIds.has(usage.runUsageModelId)
    ),
    reconciledCreditAmounts: { byItem: reconciledCreditMicroByItem },
  };
}

/**
 * Projects the reconciled attribution of one message into the document grain of the consumption
 * index: one LLM document per run usage and one tool document per action.
 *
 * Documents stay with the agent message and execution agent that incurred the cost. The separate
 * attributed agent identity rolls hidden helpers up to their user-facing parent for analytics.
 *
 * A regular tool document includes the cost of emitting its call, carrying its result into model
 * context, and its direct charge. Current attribution records a tool called through Computer with
 * only its direct charge because the parent Computer action owns the model-visible call and result
 * footprint.
 *
 * LLM documents receive the remaining model cost.
 */
/**
 * @cc [owner:sfriquet,label:product;backend] documents-add-up-to-reconciled-items
 * The documents' `credit_micro` MUST add up exactly to the reconciled amounts of the indexed items,
 * otherwise the result MUST be a `credit_mismatch` error and no document is returned. They MUST NOT
 * be compared with the message's current `costCredits`, which can be newer than the reconciliation.
 */
export function buildAgentMessageConsumptionAnalyticsDocuments(
  input: AgentMessageConsumptionAnalyticsInput
): Result<
  AgentMessageConsumptionAnalyticsData[],
  ConsumptionDocumentsSkipReason
> {
  const reconciledConsumption = readReconciledConsumption(input);
  if (!reconciledConsumption) {
    return new Ok([]);
  }

  const documents = [
    ...buildLlmConsumptionDocuments(input, reconciledConsumption),
    ...buildToolConsumptionDocuments(input, reconciledConsumption),
  ];

  const indexedCreditMicro = documents.reduce(
    (total, document) => total + document.credit_micro,
    0
  );
  let reconciledCreditMicro = 0;
  for (const creditMicro of reconciledConsumption.reconciledCreditAmounts.byItem.values()) {
    reconciledCreditMicro += creditMicro;
  }
  if (indexedCreditMicro !== reconciledCreditMicro) {
    return new Err({
      code: "credit_mismatch",
      context: {
        attributionVersion: reconciledConsumption.attributionVersion,
        indexedCreditMicro,
        reconciledCreditMicro,
        documentCount: documents.length,
      },
    });
  }

  return new Ok(documents);
}
