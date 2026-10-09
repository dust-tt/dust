import { canRaiseReasoningEffortPerMessage } from "@app/lib/api/llm/per_message_reasoning_effort";
import type { StreamModelInfo } from "@app/types/assistant/agent_run";
import { getTierForModelConfiguration } from "@app/types/assistant/models/model_tiers";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

/**
 * @cc [owner:aubin-tchoi,label:product;security] raise-keeps-model-tier
 * A raised effort is only applied to a run when it keeps the run's model in the tier of the run's
 * top-level effort: tier access and the premium allowance are checked on the top-level effort
 * only, at message creation. Raises MUST only resolve to efforts that pass this check, against the
 * effort of the run they are applied to (it can differ from the run that requested them, e.g.
 * after a model or effort change, or for another user of a shared conversation).
 */
export function keepsModelTier(
  model: ModelConfigurationType,
  { from, to }: { from: ReasoningEffort | undefined; to: ReasoningEffort }
): boolean {
  return (
    getTierForModelConfiguration(model, from) ===
    getTierForModelConfiguration(model, to)
  );
}

// The effort one step above `from` for this run: the lowest per-message raise its model accepts that
// keeps the model's tier (raise-keeps-model-tier), or null when there is none.
export function getNextRaisedReasoningEffort(
  { endpoint: { modelConfig }, reasoningEffort }: StreamModelInfo,
  from: ReasoningEffort | undefined
): ReasoningEffort | null {
  return (
    ORDERED_REASONING_EFFORTS.find(
      (to) =>
        canRaiseReasoningEffortPerMessage(modelConfig, { from, to }) &&
        keepsModelTier(modelConfig, { from: reasoningEffort, to })
    ) ?? null
  );
}
