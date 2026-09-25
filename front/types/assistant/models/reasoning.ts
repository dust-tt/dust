import type { ReasoningEffort } from "@app/types/assistant/models/types";
import capitalize from "lodash/capitalize";
import { z } from "zod";

// The router's efforts, plus the legacy "light" that stored configurations still use until they are
// migrated to the router vocabulary. "light" sits where it ran: between "minimal" and "low".
export const ORDERED_REASONING_EFFORTS = [
  "none",
  "minimal",
  "light",
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: "None",
  minimal: "Min",
  light: "Light",
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

export const ReasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);

// Display name of a stored effort; values outside the vocabulary are capitalized as is.
export function getReasoningEffortDisplayName(reasoningEffort: string): string {
  return isReasoningEffort(reasoningEffort)
    ? REASONING_EFFORT_LABELS[reasoningEffort]
    : capitalize(reasoningEffort);
}
