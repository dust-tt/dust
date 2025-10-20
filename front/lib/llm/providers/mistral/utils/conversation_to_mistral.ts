import type {
  AssistantMessage,
  ChatCompletionStreamRequest,
  ContentChunk,
  Tool,
} from "@mistralai/mistralai/models/components";
import compact from "lodash/compact";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  Content,
  ModelMessageTypeMultiActions,
} from "@app/types";
import { assertNever } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

function userContentToContentChunk(content: Content): ContentChunk {
  switch (content.type) {
    case "text":
      return content;
    case "image_url":
      return {
        type: "image_url",
        imageUrl: content.image_url.url,
      };
    default:
      assertNever(content);
  }
}

function assistantContentToContentChunk(
  content: TextContentType | ReasoningContentType | FunctionCallContentType
): ContentChunk | undefined {
  switch (content.type) {
    case "text_content":
      return {
        type: "text",
        text: content.value,
      };
    case "function_call":
      return undefined;
    case "reasoning":
      return content.value.reasoning === undefined
        ? undefined
        : {
            type: "thinking",
            thinking: [{ type: "text", text: content.value.reasoning }],
          };
    default:
      assertNever(content);
  }
}

function toAssistantMessage(
  message:
    | AssistantFunctionCallMessageTypeModel
    | AssistantContentMessageTypeModel
): AssistantMessage & { role: "assistant" } {
  if ("function_calls" in message) {
    // AssistantFunctionCallMessageTypeModel
    return {
      role: "assistant",
      content: message.contents
        ? compact(message.contents.map(assistantContentToContentChunk))
        : message.content,
      toolCalls: message.function_calls.map((fc) => ({
        id: fc.id,
        function: {
          name: fc.name,
          arguments: fc.arguments,
        },
      })),
    };
  }

  // AssistantContentMessageTypeModel
  if (!message.contents && message.content) {
    return {
      role: "assistant",
      content: message.content,
    };
  }

  return {
    role: "assistant",
    content: compact(
      (message.contents ?? []).map(assistantContentToContentChunk)
    ),
  };
}

export function toMessage(
  message: ModelMessageTypeMultiActions
): ChatCompletionStreamRequest["messages"][number] {
  switch (message.role) {
    case "user": {
      return {
        role: "user",
        content: message.content.map(userContentToContentChunk),
      };
    }
    case "function": {
      return {
        role: "tool",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map(userContentToContentChunk),
        name: message.name,
        toolCallId: message.function_call_id,
      };
    }
    case "assistant": {
      return toAssistantMessage(message);
    }
    // TODO: remove after proper renderConversationForModel return type
    case "content_fragment":
      throw new Error(
        "Content fragment messages are not supported in Mistral conversations."
      );
    default:
      assertNever(message);
  }
}

export function toTool(specification: AgentActionSpecification): Tool {
  return {
    type: "function",
    function: {
      name: specification.name,
      description: specification.description,
      parameters: specification.inputSchema,
      strict: false,
    },
  };
}
