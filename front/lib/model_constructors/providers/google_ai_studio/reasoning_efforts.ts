// Reasoning efforts Gemini 3.x models accept as a non-null thinking level. The
// `none` effort is handled separately (a minimal thinking budget with thoughts
// hidden), since Gemini 3 cannot fully disable thinking. `maximal` maps to the
// highest native level (HIGH), mirroring the Anthropic sibling; `minimal` and
// `xhigh` are intentionally unsupported.
export const GEMINI_SUPPORTED_NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "maximal",
] as const;

export type GeminiSupportedNonNullReasoningEffort =
  (typeof GEMINI_SUPPORTED_NON_NULL_REASONING_EFFORTS)[number];

export function isGeminiSupportedNonNullReasoningEffort(
  effort: string
): effort is GeminiSupportedNonNullReasoningEffort {
  return GEMINI_SUPPORTED_NON_NULL_REASONING_EFFORTS.some(
    (supported) => supported === effort
  );
}
