import assert from "node:assert";

import type {
  FunctionTool,
  ResponseFunctionToolCallOutputItem,
  ResponseInput,
  ResponseInputContent,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import type {
  Reasoning,
  ReasoningEffort as OpenAiReasoningEffort,
} from "openai/resources/shared";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { extractIdFromMetadata } from "@app/lib/api/llm/utils";
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

function toAssistantInputItem(
  content: AgentContentItemType
): ResponseInputItem {
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
    case "reasoning":
      assert(content.value.reasoning, "Expected non-null reasoning content");
      const id = extractIdFromMetadata(content.value.metadata);
      return {
        id,
        type: "reasoning",
        summary: [{ type: "summary_text", text: content.value.reasoning }],
      };
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
        inputs.push(...message.contents.map(toAssistantInputItem));
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
  const properties = tool.inputSchema.properties ?? {};
  const parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  } = {
    type: "object",
    properties,
    // OpenAI requires all properties to be marked as required
    required: Object.keys(properties),
    additionalProperties: false,
  };

  return {
    type: "function",
    strict: true,
    name: tool.name,
    description: tool.description,
    parameters,
  };
}

const REASONING_EFFORT_TO_OPENAI_REASONING: {
  [key in ReasoningEffort]: OpenAiReasoningEffort;
} = {
  none: null,
  light: "low",
  medium: "medium",
  high: "high",
};

export function toReasoning(
  reasoningEffort: ReasoningEffort | null
): Reasoning | null {
  if (!reasoningEffort) {
    return null;
  }

  return {
    effort: REASONING_EFFORT_TO_OPENAI_REASONING[reasoningEffort],
    summary: "auto",
  };
}
