// Native Gemini 3.x thinking levels exposed as reasoning efforts. Every Gemini
// model supports low/medium/high; Flash and Flash-Lite additionally support
// `minimal`. Gemini always thinks, so there is no `none` effort.
export const GEMINI_PRO_SUPPORTED_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
] as const;

export const GEMINI_SUPPORTED_REASONING_EFFORTS = [
  "minimal",
  ...GEMINI_PRO_SUPPORTED_REASONING_EFFORTS,
] as const;

export type GeminiSupportedReasoningEffort =
  (typeof GEMINI_SUPPORTED_REASONING_EFFORTS)[number];
