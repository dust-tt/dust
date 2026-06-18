import type {
  OutputFormat,
  ToolSpecification,
} from "@app/lib/model_constructors/types/input/configuration";
import type {
  BaseAssistantMessage,
  BaseAssistantReasoningMessage,
  BaseAssistantTextMessage,
  BaseAssistantToolCallRequestMessage,
  BaseConversation,
  BaseToolCallResultMessage,
  BaseUserImageMessage,
  BaseUserMessage,
  BaseUserTextMessage,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  ChatCompletionStreamRequest,
  ResponseFormat,
  Tool,
  ToolChoice,
} from "@mistralai/mistralai/models/components";

type MistralMessage = ChatCompletionStreamRequest["messages"][number];

const TOOL_CALL_ID_LENGTH = 9;

// Mistral requires tool-call ids to be exactly 9 alphanumeric chars, but ids can
// originate from other providers. Normalize to that shape deterministically.
export function sanitizeToolCallId(id: string): string {
  let s = id.replace(/[^a-zA-Z0-9]/g, "0");
  if (s.length > TOOL_CALL_ID_LENGTH) {
    s = s.slice(0, TOOL_CALL_ID_LENGTH);
  }
  if (s.length < TOOL_CALL_ID_LENGTH) {
    s = s.padStart(TOOL_CALL_ID_LENGTH, "0");
  }
  return s;
}

// The per-message leaf converters. The composite below takes an object
// satisfying this interface (`this`), so overriding one leaf on an endpoint
// changes how the composite uses it.
export interface MistralMessageConverters {
  systemMessageToMessage(message: SystemTextMessage): MistralMessage;
  userTextMessageToMessage(message: BaseUserTextMessage): MistralMessage;
  userImageMessageToMessage(message: BaseUserImageMessage): MistralMessage;
  toolCallResultMessageToMessage(
    message: BaseToolCallResultMessage
  ): MistralMessage;
  assistantTextMessageToMessage(
    message: BaseAssistantTextMessage
  ): MistralMessage;
  assistantReasoningMessageToMessage(
    message: BaseAssistantReasoningMessage
  ): MistralMessage;
  assistantToolCallRequestToMessage(
    message: BaseAssistantToolCallRequestMessage
  ): MistralMessage;
}

// -- Leaf converters: one Mistral message per conversation message --

export function systemMessageToMessage(
  message: SystemTextMessage
): MistralMessage {
  return { role: "system", content: message.content.value };
}

export function userTextMessageToMessage(
  message: BaseUserTextMessage
): MistralMessage {
  return {
    role: "user",
    content: [{ type: "text", text: message.content.value }],
  };
}

export function userImageMessageToMessage(
  message: BaseUserImageMessage
): MistralMessage {
  return {
    role: "user",
    content: [{ type: "image_url", imageUrl: message.content.url }],
  };
}

export function toolCallResultMessageToMessage(
  message: BaseToolCallResultMessage
): MistralMessage {
  const content = message.content.parts
    .map((part) => {
      switch (part.type) {
        case "text":
          return part.text;
        case "image_url":
          return part.url;
        default:
          return assertNever(part);
      }
    })
    .join("\n");

  return {
    role: "tool",
    content,
    toolCallId: sanitizeToolCallId(message.content.callId),
  };
}

export function assistantTextMessageToMessage(
  message: BaseAssistantTextMessage
): MistralMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: message.content.value }],
  };
}

export function assistantReasoningMessageToMessage(
  message: BaseAssistantReasoningMessage
): MistralMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "thinking",
        thinking: [{ type: "text", text: message.content.value }],
      },
    ],
  };
}

export function assistantToolCallRequestToMessage(
  message: BaseAssistantToolCallRequestMessage
): MistralMessage {
  return {
    role: "assistant",
    toolCalls: [
      {
        id: sanitizeToolCallId(message.content.callId),
        function: {
          name: message.content.toolName,
          arguments: message.content.arguments,
        },
      },
    ],
  };
}

// -- Composite message converter --

function userMessageToMessage(
  message: BaseUserMessage,
  converters: MistralMessageConverters
): MistralMessage {
  switch (message.type) {
    case "text":
      return converters.userTextMessageToMessage(message);
    case "image_url":
      return converters.userImageMessageToMessage(message);
    case "tool_call_result":
      return converters.toolCallResultMessageToMessage(message);
    default:
      assertNever(message);
  }
}

function assistantMessageToMessage(
  message: BaseAssistantMessage,
  converters: MistralMessageConverters
): MistralMessage {
  switch (message.type) {
    case "text":
      return converters.assistantTextMessageToMessage(message);
    case "reasoning":
      return converters.assistantReasoningMessageToMessage(message);
    case "tool_call_request":
      return converters.assistantToolCallRequestToMessage(message);
    default:
      assertNever(message);
  }
}

export function conversationToMistralMessages(
  conversation: BaseConversation,
  converters: MistralMessageConverters
): MistralMessage[] {
  const system = conversation.system.map((message) =>
    converters.systemMessageToMessage(message)
  );
  const messages = conversation.messages.map((message) => {
    switch (message.role) {
      case "user":
        return userMessageToMessage(message, converters);
      case "assistant":
        return assistantMessageToMessage(message, converters);
      default:
        assertNever(message);
    }
  });
  return [...system, ...messages];
}

// -- Config converters (pure) --

export function toTool(tool: ToolSpecification): Tool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: false,
    },
  };
}

export function forceToolNameToToolChoice(
  tools: ToolSpecification[],
  forceTool: string | undefined
): ToolChoice | "auto" {
  return forceTool && tools.some((tool) => tool.name === forceTool)
    ? { type: "function", function: { name: forceTool } }
    : "auto";
}

export function outputFormatToResponseFormat(
  outputFormat: OutputFormat
): ResponseFormat {
  return {
    type: "json_schema",
    jsonSchema: {
      name: outputFormat.json_schema.name,
      description: outputFormat.json_schema.description,
      schemaDefinition: outputFormat.json_schema.schema,
      strict: outputFormat.json_schema.strict ?? undefined,
    },
  };
}
