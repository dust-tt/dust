import type {
  ResponseFormat,
  ToolChoice,
} from "@mistralai/mistralai/models/components";
import type { ToolChoiceEnum } from "@mistralai/mistralai/models/components/toolchoiceenum";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";

import { parseResponseFormatSchema } from "../../../utils";

export function toToolChoiceParam(
  specifications: AgentActionSpecification[],
  forceToolCall: string | undefined
): ToolChoice | ToolChoiceEnum {
  return forceToolCall && specifications.some((s) => s.name === forceToolCall)
    ? { type: "function", function: { name: forceToolCall } }
    : ("auto" as const);
}

export function toResponseSchemaParam(
  responseFormat: string | null
): ResponseFormat | undefined {
  const responseFormatObject = parseResponseFormatSchema(
    responseFormat,
    "mistral"
  );
  if (!responseFormatObject || !responseFormatObject.json_schema) {
    return;
  }
  return {
    type: "json_schema",
    jsonSchema: {
      name: responseFormatObject.json_schema.name,
      description: responseFormatObject.json_schema.description,
      schemaDefinition: responseFormatObject.json_schema.schema,
      strict: responseFormatObject.json_schema.strict ?? false,
    },
  };
}
