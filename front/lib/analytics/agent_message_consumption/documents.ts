import { buildLlmConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/llm_documents";
import type { AgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import { buildToolConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/tool_documents";
import type { AllocationSkipReason } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ConsumptionDocumentsSkipReason =
  | AllocationSkipReason
  | {
      code: "credit_mismatch";
      context: {
        attributionVersion: number;
        indexedCreditMicro: number;
        billedCreditMicro: number;
        documentCount: number;
      };
    }
  | {
      code: "empty_documents";
      context: Record<string, never>;
    };

/**
 * Projects one complete message attribution into the document grain of the consumption index:
 * one LLM document per run usage and one tool document per action.
 *
 * Documents stay with the agent message and execution agent that incurred the cost. The separate
 * attributed agent identity rolls hidden helpers up to their user-facing parent for analytics.
 *
 * A regular tool document includes the cost of emitting its call, carrying its result into model
 * context, and its direct charge. Current attribution records a tool called through Computer with
 * only its direct charge because the parent Computer action owns the model-visible call and result
 * footprint.
 *
 * LLM documents receive the remaining model cost. Together, all credit_micro values reconcile to
 * the authoritative message charge.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] llm-documents-cover-message-counts
 * Every successful nonempty result MUST include an LLM document. All documents in
 * that result MUST share workspace_id, agent_message_id, agent, conversation_id,
 * user, context_origin, and completed_at so distinct message, conversation, and
 * user counts can exclude tool documents without losing coverage.
 */
export function buildAgentMessageConsumptionAnalyticsDocuments(
  input: AgentMessageConsumptionAnalyticsInput
): Result<
  AgentMessageConsumptionAnalyticsData[],
  ConsumptionDocumentsSkipReason
> {
  const allocationResult = buildLatestMessageConsumptionAllocation({
    actions: input.actions,
    billedCredits: input.billedCredits,
    dustRunIds: input.dustRunIds,
    items: input.items,
    runs: input.runs,
    usages: input.usages,
  });
  if (allocationResult.isErr()) {
    return allocationResult;
  }
  const allocation = allocationResult.value;

  const documents = [
    ...buildLlmConsumptionDocuments(input, allocation),
    ...buildToolConsumptionDocuments(input, allocation),
  ];

  const indexedCreditMicro = documents.reduce(
    (total, document) => total + document.credit_micro,
    0
  );

  // This is the final safety check before indexing: every per-usage/action document must reconcile
  // exactly to the authoritative message charge.
  const billedCreditMicro = roundCreditsToMicroCredits(input.billedCredits);
  if (indexedCreditMicro !== billedCreditMicro) {
    return new Err({
      code: "credit_mismatch",
      context: {
        attributionVersion: allocation.attributionVersion,
        indexedCreditMicro,
        billedCreditMicro,
        documentCount: documents.length,
      },
    });
  }

  return new Ok(documents);
}
