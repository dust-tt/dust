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

// The effort reached by raising `from` by up to `steps` steps for this run, stopping at the highest
// one available (getNextRaisedReasoningEffort). Equals `from` when it cannot be raised.
export function raiseReasoningEffort(
  modelInfo: StreamModelInfo,
  { from, steps }: { from: ReasoningEffort | undefined; steps: number }
): ReasoningEffort | undefined {
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

// Resolves the rendered effort changes against this run's effort: each raise climbs from the effort
// in effect (raiseReasoningEffort), and changes that cannot apply at all are dropped. Also returns
// the effort in effect once every change is applied.
export function resolveEffortChanges<M extends ModelMessageTypeMultiActions>(
  modelInfo: StreamModelInfo,
  messages: M[]
): { messages: M[]; effortInEffect: ReasoningEffort | undefined } {
  let effortInEffect = modelInfo.reasoningEffort;
  const resolved = removeNulls(
    messages.map((m) => {
      if (m.role !== "effort_change") {
        return m;
      }
      // Lowering is refused by the tool for now.
      if (m.direction !== "raise") {
        return null;
      }
      const effort = raiseReasoningEffort(modelInfo, {
        from: effortInEffect,
        steps: m.steps,
      });
      if (effort === undefined || effort === effortInEffect) {
        return null;
      }
      effortInEffect = effort;
      return { ...m, effort };
    })
  );
  return { messages: resolved, effortInEffect };
}
