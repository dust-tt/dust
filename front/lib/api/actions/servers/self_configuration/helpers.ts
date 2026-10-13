import {
  canChangeReasoningEffortPerMessage,
  filterApplicableReasoningEfforts,
} from "@app/lib/api/llm/per_message_reasoning_effort";
import type { StreamModelInfo } from "@app/types/assistant/agent_run";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { getTierForModelConfiguration } from "@app/types/assistant/models/model_tiers";
import type { ReasoningEffortDirection } from "@app/types/assistant/models/reasoning";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

/**
 * @cc [owner:aubin-tchoi,label:product;security] effort-change-keeps-model-tier
 * A changed effort is only applied to a run when it keeps the run's model in the tier of the run's
 * top-level effort: tier access and the premium allowance are checked on the top-level effort
 * only, at message creation. Changes MUST only be applied to a run when they pass this check,
 * against the effort of that run (it can differ from the run that requested them, e.g. after a
 * model or effort change, or for another user of a shared conversation).
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

// The effort one step above or below `from` for this run: the closest per-message effort its model
// accepts that keeps the model's tier (effort-change-keeps-model-tier), or null when there is none.
export function getNextReasoningEffort(
  { endpoint: { modelConfig }, reasoningEffort }: StreamModelInfo,
  {
    from,
    direction,
  }: { from: ReasoningEffort | null; direction: ReasoningEffortDirection }
): ReasoningEffort | null {
  if (from === null) {
    return null;
  }
  const fromIndex = ORDERED_REASONING_EFFORTS.indexOf(from);
  const candidates = ORDERED_REASONING_EFFORTS.filter(
    (to) =>
      canChangeReasoningEffortPerMessage(modelConfig, { from, to }) &&
      keepsModelTier(modelConfig, { from: reasoningEffort, to })
  );
  return (
    (direction === "raise"
      ? candidates.find(
          (to) => ORDERED_REASONING_EFFORTS.indexOf(to) > fromIndex
        )
      : candidates.findLast(
          (to) => ORDERED_REASONING_EFFORTS.indexOf(to) < fromIndex
        )) ?? null
  );
}

// The effort reached by moving `from` up to `steps` steps in `direction` for this run, stopping at
// the highest or lowest one available (getNextReasoningEffort). Equals `from` when it cannot move.
export function moveReasoningEffort(
  modelInfo: StreamModelInfo,
  {
    from,
    direction,
    steps,
  }: {
    from: ReasoningEffort | null;
    direction: ReasoningEffortDirection;
    steps: number;
  }
): ReasoningEffort | null {
  let effort = from;
  for (let step = 0; step < steps; step++) {
    const next = getNextReasoningEffort(modelInfo, { from: effort, direction });
    if (next === null) {
      break;
    }
    effort = next;
  }
  return effort;
}

// Keeps the effort changes this run can apply: the ones that keep its model in the tier of its
// top-level effort (effort-change-keeps-model-tier). Also returns the effort in effect once they
// apply, following the filter the LLM layer applies before sending them
// (effort-messages-change-effort).
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
  const lastEffortChange = filterApplicableReasoningEfforts(modelConfig, kept, {
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
