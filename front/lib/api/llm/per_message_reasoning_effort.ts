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
 * @cc [owner:aubin-tchoi,label:product] per-message-effort-changes
 * Returns true iff `model` supports per-message reasoning effort, `from` (the effort in effect: the
 * request's top-level effort or a per-message effort already applied) and `to` are efforts `model`
 * supports other than `none`, and `to` differs from `from`. It MUST return false when `from` or
 * `to` is `none` or `from` is null: thinking is then disabled or the model default, and a
 * per-message effort can 400 there.
 */
export function canChangeReasoningEffortPerMessage(
  model: ModelConfigurationType,
  { from, to }: { from: ReasoningEffort | null; to: ReasoningEffort }
): boolean {
  return (
    supportsPerMessageReasoningEffort(model) &&
    from !== null &&
    from !== "none" &&
    to !== "none" &&
    model.supportedReasoningEfforts[from] &&
    model.supportedReasoningEfforts[to] &&
    to !== from
  );
}

/**
 * @cc [owner:aubin-tchoi,label:product] effort-messages-change-effort
 * Returns `items` in order, without the per-message efforts (`getEffort` non-null) that cannot
 * change the effort in effect per `canChangeReasoningEffortPerMessage`. The effort in effect starts
 * at `effort` (the request's top-level effort) and becomes each kept item's effort, so each kept
 * item moves it. Model constructors render every effort message they receive, so the messages sent
 * to a model MUST go through this filter.
 */
export function filterApplicableReasoningEfforts<T>(
  model: ModelConfigurationType,
  items: T[],
  {
    effort,
    getEffort,
  }: {
    effort: ReasoningEffort | null;
    getEffort: (item: T) => ReasoningEffort | null;
  }
): T[] {
  const kept: T[] = [];
  let effortInEffect = effort;
  for (const item of items) {
    const to = getEffort(item);
    if (to !== null) {
      if (
        !canChangeReasoningEffortPerMessage(model, { from: effortInEffect, to })
      ) {
        continue;
      }
      effortInEffect = to;
    }
    kept.push(item);
  }
  return kept;
}
