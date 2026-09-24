import { ORDERED_REASONING_EFFORTS } from "@app/lib/model_constructors/types/reasoning_efforts";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import capitalize from "lodash/capitalize";
import { z } from "zod";

export { ORDERED_REASONING_EFFORTS };

// Before the product adopted the router's effort vocabulary, "low" was called "light". Stored
// agent configurations and suggestions, as well as public API / SDK / YAML callers, may still
// send it.
const LEGACY_LIGHT_REASONING_EFFORT = "light";

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: "None",
  minimal: "Min",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  maximal: "Max",
};

export const isReasoningEffort = (
  reasoningEffort: string
): reasoningEffort is ReasoningEffort =>
  ORDERED_REASONING_EFFORTS.includes(reasoningEffort as ReasoningEffort);

export function normalizeLegacyReasoningEffort<T>(
  reasoningEffort: T
): T | "low" {
  return reasoningEffort === LEGACY_LIGHT_REASONING_EFFORT
    ? "low"
    : reasoningEffort;
}

// Accepts the legacy "light" alias and outputs "low".
export const ReasoningEffortSchema = z.preprocess(
  normalizeLegacyReasoningEffort,
  z.enum(ORDERED_REASONING_EFFORTS)
);

// Display name of a stored effort; values outside the vocabulary are capitalized as is.
export function getReasoningEffortDisplayName(reasoningEffort: string): string {
  return isReasoningEffort(reasoningEffort)
    ? REASONING_EFFORT_LABELS[reasoningEffort]
    : capitalize(reasoningEffort);
}
