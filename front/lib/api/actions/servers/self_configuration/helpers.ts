import {
  canRaiseReasoningEffortPerMessage,
  filterRaisingReasoningEfforts,
} from "@app/lib/api/llm/per_message_reasoning_effort";
import type { StreamModelInfo } from "@app/types/assistant/agent_run";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
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
  from: ReasoningEffort | null
): ReasoningEffort | null {
  return (
    ORDERED_REASONING_EFFORTS.find(
      (to) =>
        canRaiseReasoningEffortPerMessage(modelConfig, { from, to }) &&
        keepsModelTier(modelConfig, { from: reasoningEffort, to })
    ) ?? null
  );
}

// The effort reached by raising `from` by up to `steps` steps for this run, stopping at the highest
// one available (getNextRaisedReasoningEffort). Equals `from` when it cannot be raised.
export function raiseReasoningEffort(
  modelInfo: StreamModelInfo,
  { from, steps }: { from: ReasoningEffort | null; steps: number }
): ReasoningEffort | null {
  let effort = from;
  for (let step = 0; step < steps; step++) {
    const next = getNextRaisedReasoningEffort(modelInfo, effort);
    if (next === null) {
      break;
    }
    effort = next;
  }
  return effort;
}

// Keeps the effort changes this run can apply: the ones that keep its model in the tier of its
// top-level effort (raise-keeps-model-tier). Also returns the effort in effect once they apply,
// following the filter the LLM layer applies before sending them (effort-messages-only-raise).
export function filterEffortChangesForRun<
  M extends ModelMessageTypeMultiActions,
>(
  { endpoint: { modelConfig }, reasoningEffort }: StreamModelInfo,
  messages: M[]
): { messages: M[]; effortInEffect: ReasoningEffort | null } {
  const kept = messages.filter(
    (m) =>
      m.role !== "effort_change" ||
      keepsModelTier(modelConfig, { from: reasoningEffort, to: m.effort })
  );
  const lastEffortChange = filterRaisingReasoningEfforts(modelConfig, kept, {
    effort: reasoningEffort ?? null,
    getEffort: (m) => (m.role === "effort_change" ? m.effort : null),
  }).findLast((m) => m.role === "effort_change");

  return {
    messages: kept,
    effortInEffect:
      lastEffortChange?.role === "effort_change"
        ? lastEffortChange.effort
        : (reasoningEffort ?? null),
  };
}
