// Mistral exposes two reasoning levels: off (`none`) and on (`high`). The values
// match Mistral's `ReasoningEffort` enum, so they are forwarded unchanged.
export const MISTRAL_SUPPORTED_REASONING_EFFORTS = ["none", "high"] as const;

// Every `reasoning_effort` the Mistral API enum admits, across the models it
// hosts (third-party GLM-5.3 takes low/high/max). `maximal` is sent as `max`.
export const MISTRAL_HOST_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;
