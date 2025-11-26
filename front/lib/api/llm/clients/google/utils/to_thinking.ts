import type { ThinkingConfig } from "@google/genai";

import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import { GOOGLE_AI_STUDIO_MODEL_CONFIGS } from "@app/lib/api/llm/clients/google/types";
import type { ReasoningEffort } from "@app/types";
import { assertNever } from "@app/types";

const THINKING_BUDGET_CONFIG_MAPPING: Record<ReasoningEffort, number> = {
  // Budget of 0 would throw for some thinking models,
  // so we default to the minimum supported by all models.
  none: 512,
  light: 1024,
  medium: 2048,
  high: 4096,
};

export function toThinkingConfig({
  modelId,
  reasoningEffort,
  useNativeLightReasoning,
}: {
  modelId: GoogleAIStudioWhitelistedModelId;
  reasoningEffort: ReasoningEffort | null;
  useNativeLightReasoning?: boolean;
}): ThinkingConfig | undefined {
  const thinkingBudgetConfigMapping = {
    ...THINKING_BUDGET_CONFIG_MAPPING,
    ...GOOGLE_AI_STUDIO_MODEL_CONFIGS[modelId].thinkingBudgetConfigMapping,
  };

  if (reasoningEffort === "light" && !useNativeLightReasoning) {
    return {
      thinkingBudget: thinkingBudgetConfigMapping.none,
      includeThoughts: true,
    };
  }

  switch (reasoningEffort) {
    case null:
      return undefined;
    case "none":
    case "light":
    case "medium":
    case "high":
      return {
        thinkingBudget: thinkingBudgetConfigMapping[reasoningEffort],
        includeThoughts: true,
      };
    default:
      assertNever(reasoningEffort);
  }
}
