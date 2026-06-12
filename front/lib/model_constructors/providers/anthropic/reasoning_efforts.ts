export const ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "maximal",
] as const;

export type AnthropicSupportedNonNullReasoningEffort =
  (typeof ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS)[number];

export function isAnthropicSupportedNonNullReasoningEffort(
  effort: string
): effort is AnthropicSupportedNonNullReasoningEffort {
  return ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS.some(
    (supported) => supported === effort
  );
}
