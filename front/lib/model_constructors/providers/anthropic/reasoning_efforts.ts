export const ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

export type AnthropicSupportedNonNullReasoningEffort =
  (typeof ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS)[number];
