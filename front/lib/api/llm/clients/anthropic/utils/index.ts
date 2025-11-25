import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages.mjs";

import type { ReasoningEffort } from "@app/types";
import { assertNever } from "@app/types";

// thinking.enabled.budget_tokens: Input should be greater than or equal to 1024
const ANTHROPIC_MINIMUM_THINKING_BUDGET = 1024;

export const ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING = {
  // All Claude models have useNativeLightReasoning set to false,
  // so light budget token should not be used.
  light: ANTHROPIC_MINIMUM_THINKING_BUDGET,
  medium: ANTHROPIC_MINIMUM_THINKING_BUDGET,
  high: 4096,
};

export function toThinkingConfig(
  reasoningEffort: ReasoningEffort | null,
  useNativeLightReasoning?: boolean
): ThinkingConfigParam | undefined {
  // Use meta prompt chain of thoughts for performance
  if (reasoningEffort === "light" && !useNativeLightReasoning) {
    return { type: "disabled" };
  }

  switch (reasoningEffort) {
    case null:
      return undefined;
    case "none":
      return { type: "disabled" };
    case "light":
    case "medium":
    case "high":
      return {
        type: "enabled",
        budget_tokens:
          ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING[reasoningEffort],
      };
    default:
      assertNever(reasoningEffort);
  }
}
