import assert from "node:assert";

import type {
  FunctionTool,
  ResponseFunctionToolCallOutputItem,
  ResponseInput,
  ResponseInputContent,
  ResponseInputItem,
} from "openai/resources/responses/responses";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { generateFunctionCallId } from "@app/lib/api/llm/clients/openai/utils/function_tool_call_id";
import type {
  Content,
  FunctionMessageTypeModel,
  UserMessageTypeModel,
} from "@app/types";
import type { ModelConversationTypeMultiActions } from "@app/types";
import { isString } from "@app/types";
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
      return {
        // TODO(LLM-Router 2025-10-28): Use reasoning id sent by provider
        id: "",
        type: "reasoning",
        summary: [{ type: "summary_text", text: content.value.reasoning }],
      };
    case "error":
      return {
        role: "assistant",
        type: "message",
        content: content.value.message,
      };
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
  const outputString = isString(message.content)
    ? message.content
    : message.content.map((content) => JSON.stringify(content)).join("\n");
  return {
    id: generateFunctionCallId(),
    type: "function_call_output",
    call_id: message.function_call_id,
    output: outputString,
  };
}

export function toInput(
  prompt: string,
  conversation: ModelConversationTypeMultiActions
): ResponseInput {
  const inputs: ResponseInput = [];
  inputs.push({
    role: "developer",
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
