// Native Gemini 3.x thinking levels exposed as reasoning efforts, verified
// against the live API on 2026-07-27 (AI Studio and Vertex agree).
//
// Every Gemini model supports low/medium/high. Most Flash and Flash-Lite models
// also accept the `MINIMAL` thinking level; Pro rejects it ("Thinking level
// MINIMAL is not supported for this model"), and so does gemini-3.7-flash
// (https://ai.google.dev/gemini-api/docs/latest-model, 2026-08-14).
//
// `none` is only exposed where thinking can genuinely be turned off, i.e. where
// `thinkingBudget: 0` is accepted — gemini-3.1-flash-lite and gemini-3.5-flash.
// gemini-3.5-flash-lite and gemini-3.6-flash reject budget 0 with
// INVALID_ARGUMENT, and Pro answers "Budget 0 is invalid. This model only works
// in thinking mode", so none of them offers a thinking-off effort.
export const GEMINI_PRO_SUPPORTED_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
] as const;

export const GEMINI_SUPPORTED_REASONING_EFFORTS = [
  "minimal",
  ...GEMINI_PRO_SUPPORTED_REASONING_EFFORTS,
] as const;

// Widest Gemini reasoning contract: the models that can actually disable
// thinking. Other models narrow it.
export const GEMINI_THINKING_OFF_SUPPORTED_REASONING_EFFORTS = [
  "none",
  ...GEMINI_SUPPORTED_REASONING_EFFORTS,
] as const;

export type GeminiSupportedReasoningEffort =
  (typeof GEMINI_THINKING_OFF_SUPPORTED_REASONING_EFFORTS)[number];
