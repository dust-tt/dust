import { canRaiseReasoningEffortPerMessage } from "@app/lib/api/llm/per_message_reasoning_effort";
import type { StreamModelInfo } from "@app/types/assistant/agent_run";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { getTierForModelConfiguration } from "@app/types/assistant/models/model_tiers";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { removeNulls } from "@app/types/shared/utils/general";

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

// Resolves the rendered effort changes against this run's effort: each raise goes one step up from
// the effort in effect (getNextRaisedReasoningEffort), and changes that cannot apply are dropped.
export function resolveEffortChanges<M extends ModelMessageTypeMultiActions>(
  modelInfo: StreamModelInfo,
  messages: M[]
): M[] {
  let effortInEffect = modelInfo.reasoningEffort;
  return removeNulls(
    messages.map((m) => {
      if (m.role !== "effort_change") {
        return m;
      }
      // Lowering is refused by the tool for now.
      if (m.direction !== "raise") {
        return null;
      }
      const effort = getNextRaisedReasoningEffort(modelInfo, effortInEffect);
      if (effort === null) {
        return null;
      }
      effortInEffect = effort;
      return { ...m, effort };
    })
  );
}

// Effort the run actually reasons at once `messages` (rendered up to the triggering user message,
// with resolved effort changes) is sent: the last resolved change, else the top-level effort.
export function getAppliedReasoningEffort(
  { reasoningEffort }: StreamModelInfo,
  messages: ModelMessageTypeMultiActions[]
): ReasoningEffort | undefined {
  const lastEffortChange = messages.findLast((m) => m.role === "effort_change");

  return (
    (lastEffortChange?.role === "effort_change"
      ? lastEffortChange.effort
      : null) ?? reasoningEffort
  );
}
