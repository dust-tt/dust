import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";

// Reasoning efforts OpenAI models accept verbatim (our `ReasoningEffort` enum
// minus the non-OpenAI "maximal"). The strings match OpenAI's, so mapping a
// supported effort is the identity.
export const OPENAI_SUPPORTED_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ReasoningEffort[];

export type OpenAISupportedReasoningEffort =
  (typeof OPENAI_SUPPORTED_REASONING_EFFORTS)[number];

export function isOpenAISupportedReasoningEffort(
  effort: string
): effort is OpenAISupportedReasoningEffort {
  return OPENAI_SUPPORTED_REASONING_EFFORTS.some(
    (supported) => supported === effort
  );
}
