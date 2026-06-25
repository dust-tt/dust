// Native Gemini 3.x thinking levels exposed as reasoning efforts. Every Gemini
// model supports low/medium/high; Flash and Flash-Lite additionally support
// `minimal`. Flash-Lite additionally supports `none` — Gemini 3 has no "off"
// thinking level, so (matching the legacy router) `none` maps to the minimum
// thinking budget with thoughts hidden.
export const GEMINI_PRO_SUPPORTED_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
] as const;

export const GEMINI_SUPPORTED_REASONING_EFFORTS = [
  "minimal",
  ...GEMINI_PRO_SUPPORTED_REASONING_EFFORTS,
] as const;

// Widest Gemini reasoning contract (Flash-Lite). Other models narrow it.
export const GEMINI_FLASH_LITE_SUPPORTED_REASONING_EFFORTS = [
  "none",
  ...GEMINI_SUPPORTED_REASONING_EFFORTS,
] as const;

export type GeminiSupportedReasoningEffort =
  (typeof GEMINI_FLASH_LITE_SUPPORTED_REASONING_EFFORTS)[number];
