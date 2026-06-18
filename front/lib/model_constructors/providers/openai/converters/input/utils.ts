import { isOpenAISupportedReasoningEffort } from "@app/lib/model_constructors/providers/openai/reasoning_efforts";
import type {
  OutputFormat,
  Reasoning,
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
  FunctionTool,
  ResponseFormatTextJSONSchemaConfig,
  ResponseInputItem,
  ToolChoiceFunction,
} from "openai/resources/responses/responses";
import type { Reasoning as OpenAIReasoning } from "openai/resources/shared";

// The per-message leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface MessageItemConverters {
  systemMessageToInputItem(message: SystemTextMessage): ResponseInputItem;
  userTextMessageToInputItem(message: BaseUserTextMessage): ResponseInputItem;
  userImageMessageToInputItem(message: BaseUserImageMessage): ResponseInputItem;
  toolCallResultMessageToInputItem(
    message: BaseToolCallResultMessage
  ): ResponseInputItem;
  assistantTextMessageToInputItem(
    message: BaseAssistantTextMessage
  ): ResponseInputItem;
  assistantReasoningMessageToInputItems(
    message: BaseAssistantReasoningMessage
  ): ResponseInputItem[];
  assistantToolCallRequestToInputItem(
    message: BaseAssistantToolCallRequestMessage
  ): ResponseInputItem;
}

// -- Leaf converters: one Responses input item per message --

// OpenAI uses the "developer" role for the system prompt on reasoning models.
export function systemMessageToInputItem(
  message: SystemTextMessage
): ResponseInputItem {
  return {
    role: "developer",
    content: [{ type: "input_text", text: message.content.value }],
  };
}

export function userTextMessageToInputItem(
  message: BaseUserTextMessage
): ResponseInputItem {
  return {
    role: "user",
    content: [{ type: "input_text", text: message.content.value }],
  };
}

export function userImageMessageToInputItem(
  message: BaseUserImageMessage
): ResponseInputItem {
  return {
    role: "user",
    content: [
      { type: "input_image", image_url: message.content.url, detail: "auto" },
    ],
  };
}

export function toolCallResultMessageToInputItem(
  message: BaseToolCallResultMessage
): ResponseInputItem {
  // The Responses function_call_output takes a single string; flatten parts.
  const output = message.content.parts
    .map((part) => {
      switch (part.type) {
        case "text":
          return part.text;
        case "image_url":
          return `[image: ${part.url}]`;
        default:
          return assertNever(part);
      }
    })
    .join("\n");
  return {
    type: "function_call_output",
    call_id: message.content.callId,
    output,
  };
}

export function assistantTextMessageToInputItem(
  message: BaseAssistantTextMessage
): ResponseInputItem {
  return { role: "assistant", content: message.content.value };
}

export function assistantReasoningMessageToInputItems(
  message: BaseAssistantReasoningMessage
): ResponseInputItem[] {
  // The Responses API keys a replayed reasoning item by its original id, which
  // we carry in `signature`; drop unsigned items (mirrors dropping unsigned
  // Anthropic thinking blocks).
  if (!message.signature) {
    return [];
  }
  return [
    {
      id: message.signature,
      type: "reasoning",
      summary: message.content.value
        ? [{ type: "summary_text", text: message.content.value }]
        : [],
    },
  ];
}

export function assistantToolCallRequestToInputItem(
  message: BaseAssistantToolCallRequestMessage
): ResponseInputItem {
  return {
    type: "function_call",
    call_id: message.content.callId,
    name: message.content.toolName,
    arguments: message.content.arguments,
  };
}

// -- Composite message converters (depend on the leaf converters) --

export function userMessageToInputItems(
  message: BaseUserMessage,
  converters: MessageItemConverters
): ResponseInputItem[] {
  switch (message.type) {
    case "text":
      return [converters.userTextMessageToInputItem(message)];
    case "image_url":
      return [converters.userImageMessageToInputItem(message)];
    case "tool_call_result":
      return [converters.toolCallResultMessageToInputItem(message)];
    default:
      assertNever(message);
  }
}

export function assistantMessageToInputItems(
  message: BaseAssistantMessage,
  converters: MessageItemConverters
): ResponseInputItem[] {
  switch (message.type) {
    case "text":
      return [converters.assistantTextMessageToInputItem(message)];
    case "reasoning":
      return converters.assistantReasoningMessageToInputItems(message);
    case "tool_call_request":
      return [converters.assistantToolCallRequestToInputItem(message)];
    default:
      assertNever(message);
  }
}

export function conversationToInput(
  conversation: BaseConversation,
  converters: MessageItemConverters
): ResponseInputItem[] {
  return conversation.messages.flatMap((message) => {
    switch (message.role) {
      case "user":
        return userMessageToInputItems(message, converters);
      case "assistant":
        return assistantMessageToInputItems(message, converters);
      default:
        assertNever(message);
    }
  });
}

export function systemMessagesToInputItems(
  system: SystemTextMessage[],
  converters: MessageItemConverters
): ResponseInputItem[] {
  return system.map((message) => converters.systemMessageToInputItem(message));
}

// -- Config converters (pure) --

export function toFunctionTool(tool: ToolSpecification): FunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    strict: true,
    parameters: { type: "object", ...tool.inputSchema },
  };
}

export function forceToolToToolChoice(
  tools: ToolSpecification[],
  forceTool: string | undefined
): ToolChoiceFunction | "auto" {
  return forceTool && tools.some((tool) => tool.name === forceTool)
    ? { type: "function", name: forceTool }
    : "auto";
}

export function outputFormatToResponseFormat(
  outputFormat: OutputFormat
): ResponseFormatTextJSONSchemaConfig {
  return {
    type: "json_schema",
    name: outputFormat.json_schema.name,
    schema: outputFormat.json_schema.schema,
    description: outputFormat.json_schema.description,
    strict: outputFormat.json_schema.strict ?? undefined,
  };
}

export function reasoningToOpenAIReasoning(
  reasoning: Reasoning | undefined
): OpenAIReasoning | undefined {
  if (!reasoning) {
    return undefined;
  }
  if (!isOpenAISupportedReasoningEffort(reasoning.effort)) {
    // "maximal" has no OpenAI equivalent; fall back to the strongest supported.
    return { effort: "xhigh", summary: "auto" };
  }
  return { effort: reasoning.effort, summary: "auto" };
}
