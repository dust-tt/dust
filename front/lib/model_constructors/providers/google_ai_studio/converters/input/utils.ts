import type { GoogleAiStudioInputConfig } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import type { GeminiSupportedReasoningEffort } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
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
import { isRecord } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type {
  Content,
  FunctionDeclaration,
  Part,
  SchemaUnion,
  ThinkingConfig,
  ToolConfig,
} from "@google/genai";
import { FunctionCallingConfigMode, ThinkingLevel } from "@google/genai";

// The per-message leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface ContentBlockConverters {
  systemMessageToPart(message: SystemTextMessage): Part;
  userTextMessageToPart(message: BaseUserTextMessage): Part;
  userImageMessageToPart(message: BaseUserImageMessage): Part;
  toolCallResultMessageToContent(message: BaseToolCallResultMessage): Content;
  assistantTextMessageToPart(message: BaseAssistantTextMessage): Part;
  assistantReasoningMessageToPart(message: BaseAssistantReasoningMessage): Part;
  assistantToolCallRequestToPart(
    message: BaseAssistantToolCallRequestMessage
  ): Part;
}

// -- Small, reusable building blocks --

// Parses tool-call arguments into an object, falling back to `{}` for malformed
// or non-object JSON.
export function parseToolArguments(
  argumentsJson: string
): Record<string, unknown> {
  const parsed = safeParseJSON(argumentsJson);
  if (parsed.isErr() || parsed.value === null || !isRecord(parsed.value)) {
    return {};
  }
  return parsed.value;
}

// -- Leaf converters: one Gemini part (or content) per message --

export function systemMessageToPart(message: SystemTextMessage): Part {
  return { text: message.content.value };
}

export function userTextMessageToPart(message: BaseUserTextMessage): Part {
  return { text: message.content.value };
}

// Gemini only accepts inline base64 image data, which requires an async fetch
// that the synchronous `buildRequestPayload` contract cannot perform. Until the
// framework supports async payload building, surface the image as a text note
// rather than dropping it silently.
export function userImageMessageToPart(_message: BaseUserImageMessage): Part {
  return { text: "Attachment: image could not be loaded." };
}

export function toolCallResultMessageToContent(
  message: BaseToolCallResultMessage
): Content {
  const output = message.content.parts
    .map((part) => {
      switch (part.type) {
        case "text":
          return part.text;
        case "image_url":
          return "Attachment: image could not be loaded.";
        default:
          return assertNever(part);
      }
    })
    .join("\n");

  return {
    role: "user",
    parts: [
      {
        functionResponse: {
          id: message.content.callId,
          response: message.content.isError ? { error: output } : { output },
        },
      },
    ],
  };
}

export function assistantTextMessageToPart(
  message: BaseAssistantTextMessage
): Part {
  return { text: message.content.value };
}

export function assistantReasoningMessageToPart(
  message: BaseAssistantReasoningMessage
): Part {
  return {
    text: message.content.value,
    thought: true,
    // Gemini 3 requires the thought signature to be echoed back in subsequent
    // requests; omit it when absent rather than sending an empty string.
    ...(message.signature ? { thoughtSignature: message.signature } : {}),
  };
}

export function assistantToolCallRequestToPart(
  message: BaseAssistantToolCallRequestMessage
): Part {
  return {
    functionCall: {
      id: message.content.callId,
      name: message.content.toolName,
      args: parseToolArguments(message.content.arguments),
    },
    ...(message.signature ? { thoughtSignature: message.signature } : {}),
  };
}

// -- Composite message converters (depend on the leaf converters) --

function userMessageToContent(
  message: BaseUserMessage,
  converters: ContentBlockConverters
): Content {
  switch (message.type) {
    case "text":
      return {
        role: "user",
        parts: [converters.userTextMessageToPart(message)],
      };
    case "image_url":
      return {
        role: "user",
        parts: [converters.userImageMessageToPart(message)],
      };
    case "tool_call_result":
      return converters.toolCallResultMessageToContent(message);
    default:
      assertNever(message);
  }
}

function assistantMessageToContent(
  message: BaseAssistantMessage,
  converters: ContentBlockConverters
): Content {
  switch (message.type) {
    case "text":
      return {
        role: "model",
        parts: [converters.assistantTextMessageToPart(message)],
      };
    case "reasoning":
      return {
        role: "model",
        parts: [converters.assistantReasoningMessageToPart(message)],
      };
    case "tool_call_request":
      return {
        role: "model",
        parts: [converters.assistantToolCallRequestToPart(message)],
      };
    default:
      assertNever(message);
  }
}

function isFunctionResponseContent(content: Content): boolean {
  const parts = content.parts ?? [];
  return (
    content.role === "user" &&
    parts.length > 0 &&
    parts.every((part) => part.functionResponse !== undefined)
  );
}

export function conversationToContents(
  conversation: BaseConversation,
  converters: ContentBlockConverters
): Content[] {
  const contents = conversation.messages.map((message) => {
    switch (message.role) {
      case "user":
        return userMessageToContent(message, converters);
      case "assistant":
        return assistantMessageToContent(message, converters);
      default:
        assertNever(message);
    }
  });

  // Merge consecutive function-response turns into one user turn: Gemini
  // requires the functionResponse part count to match the functionCall count of
  // the preceding model turn.
  return contents.reduce<Content[]>((merged, content) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      isFunctionResponseContent(previous) &&
      isFunctionResponseContent(content)
    ) {
      return [
        ...merged.slice(0, -1),
        {
          ...previous,
          parts: [...(previous.parts ?? []), ...(content.parts ?? [])],
        },
      ];
    }
    return [...merged, content];
  }, []);
}

export function systemMessagesToSystemInstruction(
  system: SystemTextMessage[],
  converters: ContentBlockConverters
): Content | undefined {
  if (system.length === 0) {
    return undefined;
  }
  return {
    role: "user",
    parts: system.map((message) => converters.systemMessageToPart(message)),
  };
}

// -- Config converters (pure) --

export function toFunctionDeclaration(
  tool: ToolSpecification
): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
  };
}

export function outputFormatToResponseSchema(
  outputFormat: OutputFormat
): SchemaUnion {
  return outputFormat.json_schema.schema;
}

export function forceToolNameToToolConfig(
  tools: ToolSpecification[],
  forceTool: string | undefined
): ToolConfig | undefined {
  return forceTool && tools.some((tool) => tool.name === forceTool)
    ? {
        functionCallingConfig: {
          allowedFunctionNames: [forceTool],
          mode: FunctionCallingConfigMode.ANY,
        },
      }
    : undefined;
}

function effortToThinkingLevel(
  effort: GeminiSupportedReasoningEffort
): ThinkingLevel {
  switch (effort) {
    case "minimal":
      return ThinkingLevel.MINIMAL;
    case "low":
      return ThinkingLevel.LOW;
    case "medium":
      return ThinkingLevel.MEDIUM;
    case "high":
      return ThinkingLevel.HIGH;
    default:
      assertNever(effort);
  }
}

export function reasoningToThinkingConfig(
  reasoning: GoogleAiStudioInputConfig["reasoning"]
): ThinkingConfig | undefined {
  if (!reasoning) {
    return undefined;
  }
  return {
    thinkingLevel: effortToThinkingLevel(reasoning.effort),
    includeThoughts: true,
  };
}
