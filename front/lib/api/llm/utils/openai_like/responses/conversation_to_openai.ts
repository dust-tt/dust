import compact from "lodash/compact";
import type {
  FunctionTool,
  ResponseFormatTextJSONSchemaConfig,
  ResponseFunctionToolCallOutputItem,
  ResponseInput,
  ResponseInputContent,
  ResponseInputItem,
  ToolChoiceFunction,
} from "openai/resources/responses/responses";
import type {
  Reasoning,
  ReasoningEffort as OpenAIReasoningEffort,
} from "openai/resources/shared";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { OpenAIWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { OPENAI_MODEL_CONFIGS } from "@app/lib/api/llm/clients/openai/types";
import {
  extractEncryptedContentFromMetadata,
  extractIdFromMetadata,
  parseResponseFormatSchema,
} from "@app/lib/api/llm/utils";
import type { RegionType } from "@app/lib/api/regions/config";
import { config } from "@app/lib/api/regions/config";
import type {
  ModelConversationTypeMultiActions,
  ReasoningEffort,
} from "@app/types";
import type {
  Content,
  FunctionMessageTypeModel,
  UserMessageTypeModel,
} from "@app/types";
import { assertNever } from "@app/types";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

function toInputContent(content: Content): ResponseInputContent {
  switch (content.type) {
    case "text":
      return { type: "input_text", text: content.text };
    case "image_url":
      return {
        type: "input_image",
        image_url: content.image_url.url,
        detail: "auto",
      };
  }
}

const REGION_MAPPING: { [key in RegionType]: "us" | "eu" } = {
  "us-central1": "us",
  "europe-west1": "eu",
};

function toAssistantInputItem(
  content: AgentContentItemType
): ResponseInputItem | null {
  switch (content.type) {
    case "text_content":
      return {
        role: "assistant",
        type: "message",
        content: content.value,
      };
    case "function_call":
      return {
        type: "function_call",
        call_id: content.value.id,
        name: content.value.name,
        arguments: content.value.arguments,
      };
    case "reasoning": {
      // The encrypted content is only usable if it was generated in the same region
      // as the one being used to call the API, since OpenAI uses different keys per region.
      // So if we find a mismatch, we skip adding this reasoning item to the input.
      // This might degrade the quality, but it's better than blowing up.
      const region = content.value.region ?? "us";

      if (region !== REGION_MAPPING[config.getCurrentRegion()]) {
        return null;
      }

      const reasoning = content.value.reasoning;
      const id = extractIdFromMetadata(content.value.metadata);
      const encryptedContent = extractEncryptedContentFromMetadata(
        content.value.metadata
      );
      return {
        id,
        type: "reasoning",
        summary: reasoning ? [{ type: "summary_text", text: reasoning }] : [],
        ...(encryptedContent ? { encrypted_content: encryptedContent } : {}),
      };
    }
    case "error":
      return {
        role: "assistant",
        type: "message",
        content: content.value.message,
      };
    default:
      assertNever(content);
  }
}

function toUserInputMessage(
  message: UserMessageTypeModel
): ResponseInputItem.Message {
  return {
    role: "user",
    content: message.content.map(toInputContent),
  };
}

function toToolCallOutputItem(
  message: FunctionMessageTypeModel
): ResponseFunctionToolCallOutputItem {
  // @ts-expect-error id property required in ResponseFunctionToolCallOutputItem however not required in practice
  return {
    type: "function_call_output",
    call_id: message.function_call_id,
    output:
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content),
  };
}

export function toInput(
  prompt: string,
  conversation: ModelConversationTypeMultiActions,
  promptRole: "system" | "developer" = "developer"
): ResponseInput {
  const inputs: ResponseInput = [];
  inputs.push({
    role: promptRole,
    content: [{ type: "input_text", text: prompt }],
  });

  for (const message of conversation.messages) {
    switch (message.role) {
      case "user":
        inputs.push(toUserInputMessage(message));
        break;
      case "assistant":
        const assistantItems = compact(
          message.contents.map(toAssistantInputItem)
        );
        inputs.push(...assistantItems);
        break;
      case "function":
        inputs.push(toToolCallOutputItem(message));
        break;
      default:
        assertNever(message);
    }
  }
  return inputs;
}

export function toTool(tool: AgentActionSpecification): FunctionTool {
  return {
    type: "function",
    // If not set to false, OpenAI requires all properties to be required,
    // and all additionalProperties to be false.
    // This does not fit with many tools that enable permissive filter properties.
    strict: false,
    name: tool.name,
    description: tool.description,
    parameters: { type: "object", ...tool.inputSchema },
  };
}

const REASONING_CONFIG_MAPPING: Record<ReasoningEffort, OpenAIReasoningEffort> =
  {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
  };

export function toReasoning(
  modelId: OpenAIWhitelistedModelId,
  reasoningEffort: ReasoningEffort | null
): Reasoning | null {
  if (!reasoningEffort) {
    return null;
  }

  const reasoningConfigMapping = {
    ...REASONING_CONFIG_MAPPING,
    ...OPENAI_MODEL_CONFIGS[modelId].reasoningConfigMapping,
  };

  return {
    effort: reasoningConfigMapping[reasoningEffort],
    summary: "auto",
  };
}

export function toToolOption(
  specifications: AgentActionSpecification[],
  forceToolCall: string | undefined
): ToolChoiceFunction | "auto" {
  return forceToolCall && specifications.some((s) => s.name === forceToolCall)
    ? {
        type: "function" as const,
        name: forceToolCall,
      }
    : "auto";
}

export function toResponseFormat(
  responseFormat: string | null,
  providerId: string
): ResponseFormatTextJSONSchemaConfig | undefined {
  const responseFormatObject = parseResponseFormatSchema(
    responseFormat,
    providerId
  );
  if (!responseFormatObject) {
    return;
  }

  return {
    type: "json_schema",
    name: responseFormatObject.json_schema.name,
    schema: responseFormatObject.json_schema.schema,
    description: responseFormatObject.json_schema.description,
    strict: responseFormatObject.json_schema.strict,
  };
}
