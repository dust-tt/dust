import type { ReasoningEffort as OpenAiReasoningEffort } from "openai/resources/shared";

import type { ModelIdType, ReasoningEffort } from "@app/types";
import { GPT_4_1_MODEL_ID } from "@app/types";

export const OPEN_AI_RESPONSES_WHITELISTED_NON_REASONING_MODEL_IDS = [
  GPT_4_1_MODEL_ID,
];
export const OPEN_AI_RESPONSES_WHITELISTED_REASONING_MODEL_IDS = [];
export const OPEN_AI_RESPONSES_WHITELISTED_MODEL_IDS: ModelIdType[] = [
  ...OPEN_AI_RESPONSES_WHITELISTED_NON_REASONING_MODEL_IDS,
  ...OPEN_AI_RESPONSES_WHITELISTED_REASONING_MODEL_IDS,
];

export type OpenAIResponsesWhitelistedReasoningModelId =
  (typeof OPEN_AI_RESPONSES_WHITELISTED_REASONING_MODEL_IDS)[number];
export type OpenAIResponsesWhitelistedModelId =
  | (typeof OPEN_AI_RESPONSES_WHITELISTED_REASONING_MODEL_IDS)[number]
  | (typeof OPEN_AI_RESPONSES_WHITELISTED_NON_REASONING_MODEL_IDS)[number];

export const REASONING_EFFORT_TO_OPENAI_REASONING: {
  [key in ReasoningEffort]: OpenAiReasoningEffort;
} = {
  none: null,
  light: "low",
  medium: "medium",
  high: "high",
};

export function isOpenAIResponsesWhitelistedModelId(
  modelId: ModelIdType
): modelId is OpenAIResponsesWhitelistedModelId {
  return (
    OPEN_AI_RESPONSES_WHITELISTED_MODEL_IDS as readonly string[]
  ).includes(modelId);
}

export function isOpenAIResponsesWhitelistedReasoningModelId(
  modelId: ModelIdType
): modelId is OpenAIResponsesWhitelistedReasoningModelId {
  return new Set<string>(OPEN_AI_RESPONSES_WHITELISTED_REASONING_MODEL_IDS).has(
    modelId
  );
}
