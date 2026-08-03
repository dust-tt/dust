// Mistral exposes two reasoning levels: off (`none`) and on (`high`). The values
// match Mistral's `ReasoningEffort` enum, so they are forwarded unchanged.
export const MISTRAL_SUPPORTED_REASONING_EFFORTS = ["none", "high"] as const;

export type MistralSupportedReasoningEffort =
  (typeof MISTRAL_SUPPORTED_REASONING_EFFORTS)[number];
