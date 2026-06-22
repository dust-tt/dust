// Fireworks serves open models through the OpenAI chat-completions API, which
// exposes reasoning via `reasoning_effort` (low/medium/high). `none` means no
// reasoning and is dropped before the request. Per-model schemas narrow this set
// (e.g. DeepSeek V3.2 only supports `none`, GLM-5.2 supports low/medium/high).
export const FIREWORKS_SUPPORTED_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
] as const;

export type FireworksSupportedReasoningEffort =
  (typeof FIREWORKS_SUPPORTED_REASONING_EFFORTS)[number];
