import type { ReasoningEffort as OpenAiReasoningEffort } from "openai/resources/shared";

import type { ReasoningEffort } from "@app/types";

export const OPEN_AI_RESPONSES_WHITELISTED_MODEL_IDS = ["gpt-4.1-2025-04-14"];

export type OpenAIResponsesWhitelistedModelId =
  (typeof OPEN_AI_RESPONSES_WHITELISTED_MODEL_IDS)[number];

export const REASONING_EFFORT_TO_OPENAI_REASONING: {
  [key in ReasoningEffort]: OpenAiReasoningEffort;
} = {
  none: null,
  light: "low",
  medium: "medium",
  high: "high",
};
