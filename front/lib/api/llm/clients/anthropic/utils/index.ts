import { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import { ReasoningEffort } from "@app/types";

export const CLAUDE_4_THINKING_BUDGET_TOKENS = {
  // thinking.enabled.budget_tokens: Input should be greater than or equal to 1024
  medium: 1024,
  high: 4096,
};

export function toThinkingConfig(
  reasoningEffort: ReasoningEffort | null,
  useNativeLightReasoning?: boolean
): ThinkingConfigParam | undefined {
  if (!reasoningEffort || reasoningEffort === "none") {
    return undefined;
  }
  if (reasoningEffort === "light") {
    // For "light", we may not use thinking config but chain of though from prompt
    if (useNativeLightReasoning) {
      return {
        type: "enabled",
        budget_tokens: 1024, // minimum budget
      };
    } else {
      return undefined;
    }
  }
  return {
    type: "enabled",
    budget_tokens: CLAUDE_4_THINKING_BUDGET_TOKENS[reasoningEffort],
  };
}
