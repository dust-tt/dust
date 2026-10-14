import { buildLlmConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/llm_documents";
import type {
  AgentMessageConsumptionAnalyticsInput,
  BilledRunUsage,
} from "@app/lib/analytics/agent_message_consumption/load";
import { buildToolConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/tool_documents";
import type { MessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

/**
 * @cc [owner:sfriquet,label:product;backend] index-latest-reconciled-items
 * The indexed snapshot MUST be the items of the newest attribution version stored for the message
 * that carry a reconciled amount, each credited its stored `reconciledCreditAmountMicro`. Items of
 * older versions and items without a reconciled amount MUST NOT be indexed, and the allocation MUST
 * NOT be recomputed from the message's current bill, usages or actions.
 */
function readReconciledConsumption(
  input: AgentMessageConsumptionAnalyticsInput
): MessageConsumptionAllocation<BilledRunUsage> | null {
  if (input.items.length === 0) {
    return null;
  }

  const attributionVersion = Math.max(
    ...input.items.map((item) => item.attributionVersion)
  );
  const reconciledCreditMicroByItem = new Map<
    AgentMessageConsumptionItemResource,
    number
  >();
  for (const item of input.items) {
    if (
      item.attributionVersion === attributionVersion &&
      item.reconciledCreditAmountMicro !== null
    ) {
      reconciledCreditMicroByItem.set(item, item.reconciledCreditAmountMicro);
    }
  }

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
