import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { parseResponseFormatSchema } from "@app/lib/api/llm/utils";
import {
  ReasoningEffort,
  type ResponseFormat,
  type ToolChoice,
} from "@mistralai/mistralai/models/components";
import type { ToolChoiceEnum } from "@mistralai/mistralai/models/components/toolchoiceenum";

export function toToolChoiceParam(
  specifications: AgentActionSpecification[],
  forceToolCall: string | undefined
): ToolChoice | ToolChoiceEnum {
  return forceToolCall && specifications.some((s) => s.name === forceToolCall)
    ? { type: "function", function: { name: forceToolCall } }
    : ("auto" as const);
}

export function toResponseFormatParam(
  responseFormat: string | null
): ResponseFormat | undefined {
  const responseFormatObject = parseResponseFormatSchema(responseFormat);
  if (!responseFormatObject) {
    return;
  }
  return {
    type: "json_schema",
    jsonSchema: {
      name: responseFormatObject.json_schema.name,
      description: responseFormatObject.json_schema.description,
      schemaDefinition: responseFormatObject.json_schema.schema,
      strict: responseFormatObject.json_schema.strict ?? undefined,
    },
  };
}

export const MISTRAL_REASONING_EFFORT_MAPPING = {
  none: ReasoningEffort.None,
  // Mistral currently supports none and high
  // light and medium are not selectable in the UI for mistral
  light: ReasoningEffort.High,
  medium: ReasoningEffort.High,
  high: ReasoningEffort.High,
};
