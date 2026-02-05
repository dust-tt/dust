import { OpenAIModelId } from "@/providers/openai/types";
import type {
  AssistantMessage,
  AssistantReasoningMessage,
  Message,
  Payload,
} from "@/types/history";
import assertNever from "assert-never";
import type {
  ResponseInput,
  ResponseInputItem,
  ResponseReasoningItem,
} from "openai/resources/responses/responses";

const toUserInputItem = (message: Message): ResponseInputItem.Message => {
  return {
    role: "user",
    type: "message",
    content: [{ type: "input_text", text: message.content.value }],
  };
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

  for (const message of payload.conversation.messages) {
    switch (message.role) {
      case "user":
        inputs.push(toUserInputItem(message));
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
