import type {
  OutputFormat,
  ToolChoiceInput,
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
import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  isRecord,
  isStringArray,
  removeNulls,
} from "@app/types/shared/utils/general";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import type {
  ReasoningEffort as OpenAIReasoningEffort,
  ResponseFormatJSONSchema,
} from "openai/resources/shared";

// This SDK client is shared across hosts and labs (OpenAI, Fireworks, ...). The
// goal is to let a specific endpoint override one small conversion step (e.g.
// how a user text message becomes a chat-completions message) without
// reimplementing the whole `buildRequestPayload`.
//
// To make that possible, conversions are split into two kinds:
//
//   - "leaf" converters (this interface): the smallest units, each turning one
//     Base* message into one chat-completions message. E.g.
//     `userTextMessageToMessage`, `userImageMessageToMessage`. These are the
//     override points.
//
//   - "composite" converters (defined below): higher-level converters that
//     assemble messages by delegating to leaves rather than doing the leaf work
//     themselves. E.g. `userMessageToMessage` switches on message type and calls
//     `userTextMessageToMessage` / `userImageMessageToMessage`.
//
// The link between them is that composites receive an object satisfying this
// interface (`this` on the endpoint class — see
// `WithOpenAICompletionsInputConverter`) and route every child call through it.
// So overriding a single leaf field on an endpoint changes how every composite
// depending on it behaves — no need to touch the composites or
// `buildRequestPayload`.
//
// This composes both ways: a composite is itself an override point. An endpoint
// can override a composite method and still reach its children through
// `this.<child>` (e.g. a custom `userMessageToMessage` that calls
// `this.userTextMessageToMessage`), so it picks up any leaf overrides too and
// only the reassembly logic changes.
//
// "leaf" / "composite" naming lives only in comments; it's just a mental model
// for how the pieces compose.
export interface OpenAICompletionsMessageConverters {
  systemMessageToMessage(
    message: SystemTextMessage
  ): ChatCompletionMessageParam;
  userTextMessageToMessage(
    message: BaseUserTextMessage
  ): ChatCompletionMessageParam;
  userImageMessageToMessage(
    message: BaseUserImageMessage
  ): ChatCompletionMessageParam;
  toolCallResultMessageToMessage(
    message: BaseToolCallResultMessage
  ): ChatCompletionMessageParam;
  assistantTextMessageToMessage(
    message: BaseAssistantTextMessage
  ): ChatCompletionMessageParam;
  assistantReasoningMessageToMessage(
    message: BaseAssistantReasoningMessage
  ): ChatCompletionMessageParam;
  assistantToolCallRequestToMessage(
    message: BaseAssistantToolCallRequestMessage
  ): ChatCompletionMessageParam;
}

// -- Leaf converters: one chat-completions message per conversation message --

// The system prompt is sent as a `developer` message, matching the legacy
// Fireworks client (which used the shared openai-chat default role).
export function systemMessageToMessage(
  message: SystemTextMessage
): ChatCompletionMessageParam {
  return { role: "developer", content: message.content.value };
}

export function userTextMessageToMessage(
  message: BaseUserTextMessage
): ChatCompletionMessageParam {
  return {
    role: "user",
    content: [{ type: "text", text: message.content.value }],
  };
}

export function userImageMessageToMessage(
  message: BaseUserImageMessage
): ChatCompletionMessageParam {
  return {
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: { url: message.content.url, detail: "auto" },
      },
    ],
  };
}

export function toolCallResultMessageToMessage(
  message: BaseToolCallResultMessage
): ChatCompletionToolMessageParam {
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
    tool_call_id: message.content.callId,
    content,
  };
}

export function assistantTextMessageToMessage(
  message: BaseAssistantTextMessage
): ChatCompletionMessageParam {
  return { role: "assistant", content: message.content.value };
}

// Prior reasoning is replayed as assistant text, matching the legacy client
// (chat-completions has no dedicated field to send reasoning back).
export function assistantReasoningMessageToMessage(
  message: BaseAssistantReasoningMessage
): ChatCompletionMessageParam {
  return { role: "assistant", content: message.content.value };
}

export function assistantToolCallRequestToMessage(
  message: BaseAssistantToolCallRequestMessage
): ChatCompletionMessageParam {
  return {
    role: "assistant",
    tool_calls: [
      {
        id: message.content.callId,
        type: "function",
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
  converters: OpenAICompletionsMessageConverters
): ChatCompletionMessageParam {
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
  converters: OpenAICompletionsMessageConverters
): ChatCompletionMessageParam | null {
  switch (message.type) {
    case "text":
      return converters.assistantTextMessageToMessage(message);
    case "reasoning":
      return converters.assistantReasoningMessageToMessage(message);
    case "tool_call_request":
      return converters.assistantToolCallRequestToMessage(message);
    case "provider_passthrough":
      // Opaque block owned by another provider. Dropped at the loop, not sent.
      return null;
    default:
      assertNever(message);
  }
}

export function conversationToOpenAICompletionsMessages(
  conversation: BaseConversation,
  converters: OpenAICompletionsMessageConverters
): ChatCompletionMessageParam[] {
  const system = conversation.system.map((message) =>
    converters.systemMessageToMessage(message)
  );
  const messages = removeNulls(
    conversation.messages.map((message) => {
      switch (message.role) {
        case "user":
          return userMessageToMessage(message, converters);
        case "assistant":
          return assistantMessageToMessage(message, converters);
        default:
          assertNever(message);
      }
    })
  );
  return [...system, ...messages];
}

// -- Config converters (pure) --

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && isRecord(value)
    ? value
    : {};
}

export function toTool(tool: ToolSpecification): ChatCompletionTool {
  const properties = asRecord(tool.inputSchema.properties);
  const required = isStringArray(tool.inputSchema.required)
    ? tool.inputSchema.required
    : [];
  return {
    type: "function",
    function: {
      strict: true,
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

export function forceToolNameToToolChoice(
  tools: ToolSpecification[],
  { forceTool, disableToolUse }: ToolChoiceInput
): ChatCompletionToolChoiceOption {
  if (forceTool && tools.some((tool) => tool.name === forceTool)) {
    return { type: "function", function: { name: forceTool } };
  }

  if (disableToolUse) {
    return "none";
  }

  return "auto";
}

// Maps our reasoning effort to the chat-completions `reasoning_effort` value, or
// `undefined` to omit it. `none` is dropped (no reasoning). Fireworks models
// send a subset of these (e.g. GLM-5.2 uses none/high/maximal); the remaining
// branches are kept for exhaustiveness.
export function toReasoningEffortParam(
  effort: ReasoningEffort
): OpenAIReasoningEffort | undefined {
  switch (effort) {
    case "none":
      return "none";
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    case "maximal":
      return "max";
    default:
      return assertNever(effort);
  }
}

export function outputFormatToResponseFormat(
  outputFormat: OutputFormat
): ResponseFormatJSONSchema {
  return {
    type: "json_schema",
    json_schema: {
      name: outputFormat.json_schema.name,
      description: outputFormat.json_schema.description,
      schema: outputFormat.json_schema.schema,
      strict: outputFormat.json_schema.strict ?? undefined,
    },
  };
}
