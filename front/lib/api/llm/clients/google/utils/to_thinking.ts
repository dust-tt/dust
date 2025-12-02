import type { SchemaUnion, ThinkingConfig, ToolConfig } from "@google/genai";
import { FunctionCallingConfigMode } from "@google/genai";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import {
  GOOGLE_AI_STUDIO_MODEL_CONFIGS,
  GOOGLE_AI_STUDIO_PROVIDER_ID,
} from "@app/lib/api/llm/clients/google/types";
import { parseResponseFormatSchema } from "@app/lib/api/llm/utils";
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

export function toToolConfigParam(
  specifications: AgentActionSpecification[],
  forceToolCall: string | undefined
): ToolConfig | undefined {
  return forceToolCall && specifications.some((s) => s.name === forceToolCall)
    ? {
        functionCallingConfig: {
          allowedFunctionNames: [forceToolCall],
          mode: FunctionCallingConfigMode.ANY,
        },
      }
    : undefined;
}

export function toResponseSchemaParam(
  responseFormat: string | null
): SchemaUnion | undefined {
  const responseFormatObject = parseResponseFormatSchema(
    responseFormat,
    GOOGLE_AI_STUDIO_PROVIDER_ID
  );
  if (!responseFormatObject) {
    return;
  }

  // Return the schema part directly for Gemini
  return responseFormatObject.json_schema.schema;
}
