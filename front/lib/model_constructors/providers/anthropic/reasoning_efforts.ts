import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";

export const ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

export type AnthropicSupportedNonNullReasoningEffort =
  (typeof ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS)[number];

export function isAnthropicSupportedNonNullReasoningEffort(
  effort: ReasoningEffort
): effort is AnthropicSupportedNonNullReasoningEffort {
  return ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS.some(
    (e) => e === effort
  );
}
