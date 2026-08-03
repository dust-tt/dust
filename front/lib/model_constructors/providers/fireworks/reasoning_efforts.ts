// Fireworks serves open models through the OpenAI chat-completions API, which
// exposes reasoning via `reasoning_effort`. Verified live on 2026-07-27: the
// gateway validates the field against 'low', 'medium', 'high', 'xhigh', 'max',
// 'none' and 'adaptive' for every model it serves, so `minimal` is the only
// effort in our enum it rejects. Our `maximal` maps to its `max`, and `none`
// drops reasoning before the request.
export const FIREWORKS_SUPPORTED_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

export type FireworksSupportedReasoningEffort =
  (typeof FIREWORKS_SUPPORTED_REASONING_EFFORTS)[number];
