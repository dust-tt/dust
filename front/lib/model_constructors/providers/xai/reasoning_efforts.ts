import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";

// Reasoning efforts xAI's Grok models accept through the OpenAI Responses API.
// ISO with the legacy router: `lib/api/llm/.../conversation_to_openai.ts` maps
// none→none, light→low, medium→medium, high→high, so xAI only ever receives
// `none | low | medium | high` (no "minimal"/"xhigh"). The strings match
// OpenAI's, so the shared `reasoningToOpenAIResponsesReasoning` converter passes
// a supported effort through verbatim.
export const XAI_SUPPORTED_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
] as const satisfies readonly ReasoningEffort[];

export type XaiSupportedReasoningEffort =
  (typeof XAI_SUPPORTED_REASONING_EFFORTS)[number];

export function isXaiSupportedReasoningEffort(
  effort: string
): effort is XaiSupportedReasoningEffort {
  return XAI_SUPPORTED_REASONING_EFFORTS.some(
    (supported) => supported === effort
  );
}
