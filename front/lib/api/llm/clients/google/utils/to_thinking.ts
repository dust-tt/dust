import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import {
  GOOGLE_AI_STUDIO_MODEL_CONFIGS,
  GOOGLE_AI_STUDIO_PROVIDER_ID,
} from "@app/lib/api/llm/clients/google/types";
import { parseResponseFormatSchema } from "@app/lib/api/llm/utils";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SchemaUnion, ThinkingConfig, ToolConfig } from "@google/genai";
import { FunctionCallingConfigMode } from "@google/genai";

export function toThinkingConfig({
  modelId,
  reasoningEffort,
  useNativeLightReasoning,
}: {
  modelId: GoogleAIStudioWhitelistedModelId;
  reasoningEffort: ReasoningEffort | null;
  useNativeLightReasoning?: boolean;
}): ThinkingConfig | undefined {
  const thinkingConfig = GOOGLE_AI_STUDIO_MODEL_CONFIGS[modelId].thinkingConfig;

  if (reasoningEffort === "light" && !useNativeLightReasoning) {
    return thinkingConfig.none;
  }

  switch (reasoningEffort) {
    case null:
      return undefined;
    case "none":
    case "light":
    case "medium":
    case "high":
      return thinkingConfig[reasoningEffort];
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
