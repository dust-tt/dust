import type { ThinkingConfig } from "@google/genai";

import type { ReasoningEffort } from "@app/types";

export const GOOGLE_REASONING_EFFORT_TO_THINKING_BUDGET: {
  [key in ReasoningEffort]: number;
} = {
  none: 0,
  light: 1024,
  medium: 2048,
  high: 4096,
};

export function toThinkingConfig(
  reasoningEffort: ReasoningEffort | null,
  useNativeLightReasoning?: boolean
): ThinkingConfig | undefined {
  if (!reasoningEffort || reasoningEffort === "none") {
    return undefined;
  }
  if (reasoningEffort !== "light") {
    return {
      includeThoughts: true,
      thinkingBudget:
        GOOGLE_REASONING_EFFORT_TO_THINKING_BUDGET[reasoningEffort],
    };
  }

  // For "light", we may not use thinking config but chain of thought from prompt.
  if (useNativeLightReasoning) {
    return {
      includeThoughts: true,
      thinkingBudget: GOOGLE_REASONING_EFFORT_TO_THINKING_BUDGET.light,
    };
  }

  return undefined;
}
