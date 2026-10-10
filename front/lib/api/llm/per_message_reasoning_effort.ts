import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

// Per-message reasoning effort is an Anthropic Messages API feature. It is on by default so new
// Claude models get it without a config change; older ones opt out with
// `supportsPerMessageReasoningEffort: false`.
export function supportsPerMessageReasoningEffort(
  model: ModelConfigurationType
): boolean {
  return (
    model.providerId === "anthropic" &&
    model.supportsPerMessageReasoningEffort !== false
  );
}

/**
 * @cc [owner:aubin-tchoi,label:product] per-message-effort-only-raises
 * Returns true iff `model` supports per-message reasoning effort, `from` (the effort in effect: the
 * request's top-level effort or a per-message effort already applied) and `to` are efforts `model`
 * supports other than `none`, and `to` is strictly above `from`. It MUST return false when `from`
 * is `none` or absent: the top-level thinking config then is disabled or the model default, and a
 * per-message effort can 400 there.
 */
export function canRaiseReasoningEffortPerMessage(
  model: ModelConfigurationType,
  { from, to }: { from: ReasoningEffort | undefined; to: ReasoningEffort }
): boolean {
  return (
    supportsPerMessageReasoningEffort(model) &&
    from !== undefined &&
    from !== "none" &&
    to !== "none" &&
    model.supportedReasoningEfforts[from] &&
    model.supportedReasoningEfforts[to] &&
    ORDERED_REASONING_EFFORTS.indexOf(to) >
      ORDERED_REASONING_EFFORTS.indexOf(from)
  );
}

/**
 * @cc [owner:aubin-tchoi,label:product] effort-messages-only-raise
 * Returns `items` in order, without the per-message efforts (`getEffort` non-null) that do not
 * raise the effort in effect per `canRaiseReasoningEffortPerMessage`. The effort in effect starts
 * at `effort` (the request's top-level effort) and becomes each kept item's effort, so the kept
 * ones strictly increase: a later top-level effort at or above a marker supersedes it, and a marker
 * never lowers an earlier raise. Model constructors render every effort message they receive, so
 * the messages sent to a model MUST go through this filter.
 */
export function filterRaisingReasoningEfforts<T>(
  model: ModelConfigurationType,
  items: T[],
  {
    effort,
    getEffort,
  }: {
    effort: ReasoningEffort | undefined;
    getEffort: (item: T) => ReasoningEffort | null;
  }
): T[] {
  const kept: T[] = [];
  let effortInEffect = effort;
  for (const item of items) {
    const to = getEffort(item);
    if (to !== null) {
      if (
        !canRaiseReasoningEffortPerMessage(model, { from: effortInEffect, to })
      ) {
        continue;
      }
      effortInEffect = to;
    }
    kept.push(item);
  }
  return kept;
}
