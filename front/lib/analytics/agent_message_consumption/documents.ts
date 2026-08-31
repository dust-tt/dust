import { buildLlmConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/llm_documents";
import type { AgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import { buildToolConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/tool_documents";
import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import logger from "@app/logger/logger";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";

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
export function buildAgentMessageConsumptionAnalyticsDocuments(
  input: AgentMessageConsumptionAnalyticsInput
): AgentMessageConsumptionAnalyticsData[] | null {
  const allocation = buildLatestMessageConsumptionAllocation({
    actions: input.actions,
    billedCredits: input.billedCredits,
    dustRunIds: input.dustRunIds,
    items: input.items,
    runs: input.runs,
    usages: input.usages,
    useStoredReconciledCredits: input.usesStoredReconciledCredits ?? false,
  });
  if (!allocation) {
    return null;
  }

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
  // TODO(2026-08-07 OBSERVABILITY): Replace with an assert once done implementing.
  const billedCreditMicro = roundCreditsToMicroCredits(input.billedCredits);
  if (indexedCreditMicro !== billedCreditMicro) {
    logger.warn(
      {
        workspaceId: input.workspaceId,
        agentMessageId: input.agentMessageId,
        attributionVersion: allocation.attributionVersion,
        indexedCreditMicro,
        billedCreditMicro,
        documentCount: documents.length,
      },
      "[ConsumptionAnalytics] Indexed credits do not match billed credits"
    );

    return null;
  }

  return documents;
}
