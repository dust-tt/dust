import assertNever from "assert-never";
import type {
  ResponseInput,
  ResponseInputItem,
  ResponseReasoningItem,
} from "openai/resources/responses/responses";

import type { OpenAIModelId } from "@/providers/openai/types";
import type {
  AssistantMessage,
  AssistantReasoningMessage,
  Payload,
  UserMessage,
} from "@/types/history";

const toUserInputItems = (message: UserMessage): ResponseInputItem[] => {
  switch (message.type) {
    case "text":
      return [
        {
          role: "user",
          type: "message",
          content: [{ type: "input_text", text: message.content.value }],
        },
      ];
    case "tool_call_result":
      return [
        {
          type: "function_call_output",
          call_id: message.content.toolCallId,
          output: message.content.outputJson,
        },
      ];
    default:
      assertNever(message);
  }
};

const toAssistantInputItems = (
  message: AssistantMessage,
  modelId: OpenAIModelId
): ResponseInputItem[] => {
  switch (message.type) {
    case "text":
      return [
        {
          role: "assistant",
          type: "message",
          content: [{ type: "input_text", text: message.content.value }],
        },
      ];
    case "reasoning":
      return toAssistantReasoningInputItems(message, modelId);
    case "tool_call_request":
      return [
        {
          type: "function_call",
          call_id: message.content.toolCallId,
          name: message.content.toolName,
          arguments: message.content.arguments,
        },
      ];
    default:
      assertNever(message);
  }
};

const toAssistantReasoningInputItems = (
  message: AssistantReasoningMessage,
  modelId: OpenAIModelId
): ResponseReasoningItem[] => {
  if (message.metadata === undefined || message.metadata.modelId !== modelId) {
    return [];
  }
  return [
    {
      type: "reasoning",
      id: message.metadata.itemId,
      summary: [{ text: message.content.value, type: "summary_text" }],
    },
  ];
};

export const toInput = (
  payload: Payload,
  modelId: OpenAIModelId
): ResponseInput => {
  const inputs: ResponseInput = [];

  // Add prompt as a user message at the end if present
  if (payload.systemPrompt?.value) {
    inputs.push({
      role: "system",
      type: "message",
      content: [{ type: "input_text", text: payload.systemPrompt.value }],
    });
  }

  for (const message of payload.conversation.messages) {
    switch (message.role) {
      case "system":
        break;
      case "user":
        inputs.push(...toUserInputItems(message));
        break;
      case "assistant":
        inputs.push(...toAssistantInputItems(message, modelId));
        break;
      default:
        assertNever(message);
    }
  }

  return inputs;
};
