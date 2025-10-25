import type {
  FunctionTool,
  ResponseFunctionToolCallOutputItem,
  ResponseInput,
  ResponseInputContent,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";

import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  Content,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActionsWithoutContentFragment as Message,
  UserMessageTypeModel,
} from "@app/types";
import type {
  AgentReasoningEffort,
  ModelConversationTypeMultiActions,
} from "@app/types";
import { isString } from "@app/types";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import { AgentActionSpecificEvent } from "@dust-tt/client";
import { AgentActionSpecification } from "@app/lib/actions/types/agent";

export function toOpenAIReasoningEffort(
  reasoningEffort: AgentReasoningEffort
): ReasoningEffort | null {
  return reasoningEffort === "none"
    ? null
    : reasoningEffort === "light"
      ? "low"
      : reasoningEffort;
}

function toUserContent(content: Content): ResponseInputContent {
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

function toAssistantItem(content: AgentContentItemType): ResponseInputItem {
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
      return {
        id: "",
        type: "reasoning",
        summary: [
          { type: "summary_text", text: content.value.reasoning ?? "" },
        ],
      };
    case "error":
      return {
        role: "assistant",
        type: "message",
        content: content.value.message,
      };
  }
}

function systemPrompt(prompt: string): ResponseInputItem.Message {
  return {
    role: "developer",
    content: [{ type: "input_text", text: prompt }],
  };
}

function userMessage(message: UserMessageTypeModel): ResponseInputItem.Message {
  return {
    role: "user",
    content: message.content.map(toUserContent),
  };
}

function assistantMessages(
  message:
    | AssistantContentMessageTypeModel
    | AssistantFunctionCallMessageTypeModel
): ResponseInputItem[] {
  return message.contents.map(toAssistantItem);
}

function functionMessage(
  message: FunctionMessageTypeModel
): ResponseFunctionToolCallOutputItem {
  const outputString = isString(message.content)
    ? message.content
    : message.content.map((content) => JSON.stringify(content)).join("\n");
  return {
    id: message.function_call_id,
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
  inputs.push(systemPrompt(prompt));

  for (const message of conversation.messages) {
    switch (message.role) {
      case "user":
        inputs.push(userMessage(message));
        break;
      case "assistant":
        inputs.push(...assistantMessages(message));
        break;
      case "function":
        inputs.push(functionMessage(message));
        break;
    }
  }
  return inputs;
}

export function toTool(tool: AgentActionSpecification): FunctionTool {
  const parameters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tool.inputSchema)) {
    parameters[key] = value;
  }
  return {
    type: "function",
    strict: true,
    name: tool.name,
    description: tool.description,
    parameters,
  };
}
