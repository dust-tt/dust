import type {
  MessageParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages.mjs";
import assertNever from "assert-never";

import type { AnthropicModelId } from "@/providers/anthropic/types";
import type { AssistantMessage, Payload, UserMessage } from "@/types/history";

const toUserMessages = (message: UserMessage): MessageParam[] => {
  switch (message.type) {
    case "text":
      return [
        {
          role: "user",
          content: message.content.value,
        },
      ];
    case "tool_call_result": {
      const toolResult: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: message.metadata?.callId ?? "",
        content: message.content.outputJson,
        is_error: message.content.isError,
      };
      return [
        {
          role: "user",
          content: [toolResult],
        },
      ];
    }
    default:
      assertNever(message);
  }
};

const toAssistantMessages = (
  message: AssistantMessage,
  _modelId: AnthropicModelId
): MessageParam[] => {
  switch (message.type) {
    case "text":
      return [
        {
          role: "assistant",
          content: message.content.value,
        },
      ];
    case "reasoning":
      // Anthropic doesn't have a separate reasoning type in the Messages API
      // Extended thinking is handled automatically by the model
      return [];
    case "tool_call_request":
      return [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: message.metadata?.callId ?? "",
              name: message.content.toolName,
              input: JSON.parse(message.content.arguments),
            },
          ],
        },
      ];
    default:
      assertNever(message);
  }
};

export const toInput = (
  payload: Payload,
  modelId: AnthropicModelId
): { messages: MessageParam[]; system?: string } => {
  const messages: MessageParam[] = [];

  for (const message of payload.conversation.messages) {
    switch (message.role) {
      case "system":
        break;
      case "user":
        messages.push(...toUserMessages(message));
        break;
      case "assistant":
        messages.push(...toAssistantMessages(message, modelId));
        break;
      default:
        assertNever(message);
    }
  }

  return {
    messages,
    system: payload.systemPrompt?.value,
  };
};
