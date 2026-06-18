import type {
  CacheControlEphemeral,
  ImageBlockParam,
  MessageParam,
  OutputConfig,
  TextBlockParam,
  ThinkingBlockParam,
  ThinkingConfigAdaptive,
  ThinkingConfigDisabled,
  Tool,
  ToolChoiceAuto,
  ToolChoiceTool,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import type { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
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
  CacheOption,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isRecord } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// The per-message leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface MessageBlockConverters {
  systemMessageToTextBlock(message: SystemTextMessage): TextBlockParam;
  userTextMessageToTextBlock(message: BaseUserTextMessage): TextBlockParam;
  userImageMessageToImageBlock(message: BaseUserImageMessage): ImageBlockParam;
  toolCallResultMessageToToolResultBlock(
    message: BaseToolCallResultMessage
  ): ToolResultBlockParam;
  assistantTextMessageToTextBlock(
    message: BaseAssistantTextMessage
  ): TextBlockParam;
  assistantReasoningMessageToThinkingBlocks(
    message: BaseAssistantReasoningMessage
  ): ThinkingBlockParam[];
  assistantToolCallRequestToToolUseBlock(
    message: BaseAssistantToolCallRequestMessage
  ): ToolUseBlockParam;
}

// -- Small, reusable building blocks --

// Spreadable fragment adding `cache_control` only when the message opts in.
export function cacheControlFor(
  cache: CacheOption | undefined
): { cache_control: CacheControlEphemeral } | Record<string, never> {
  switch (cache) {
    case "short":
      return { cache_control: { type: "ephemeral", ttl: "5m" } };
    case "long":
      return { cache_control: { type: "ephemeral", ttl: "1h" } };
    case undefined:
      return {};
    default:
      assertNever(cache);
  }
}

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

// -- Leaf converters: one Anthropic block per message --

export function systemMessageToTextBlock(
  message: SystemTextMessage
): TextBlockParam {
  return {
    type: "text",
    text: message.content.value,
    ...cacheControlFor(message.cache),
  };
}

export function userTextMessageToTextBlock(
  message: BaseUserTextMessage
): TextBlockParam {
  return {
    type: "text",
    text: message.content.value,
    ...cacheControlFor(message.cache),
  };
}

export function userImageMessageToImageBlock(
  message: BaseUserImageMessage
): ImageBlockParam {
  return {
    type: "image",
    source: { type: "url", url: message.content.url },
    ...cacheControlFor(message.cache),
  };
}

export function toolCallResultMessageToToolResultBlock(
  message: BaseToolCallResultMessage
): ToolResultBlockParam {
  const content: Array<TextBlockParam | ImageBlockParam> =
    message.content.parts.map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "image_url":
          return { type: "image", source: { type: "url", url: part.url } };
        default:
          return assertNever(part);
      }
    });
  return {
    type: "tool_result",
    tool_use_id: message.content.callId,
    content,
    ...(message.content.isError ? { is_error: true } : {}),
    ...cacheControlFor(message.cache),
  };
}

export function assistantTextMessageToTextBlock(
  message: BaseAssistantTextMessage
): TextBlockParam {
  return { type: "text", text: message.content.value };
}

export function assistantReasoningMessageToThinkingBlocks(
  message: BaseAssistantReasoningMessage
): ThinkingBlockParam[] {
  // Anthropic rejects thinking blocks without a signature, so drop unsigned ones.
  if (!message.signature) {
    return [];
  }
  return [
    {
      type: "thinking",
      thinking: message.content.value,
      signature: message.signature,
    },
  ];
}

export function assistantToolCallRequestToToolUseBlock(
  message: BaseAssistantToolCallRequestMessage
): ToolUseBlockParam {
  return {
    type: "tool_use",
    id: message.content.callId,
    name: message.content.toolName,
    input: parseToolArguments(message.content.arguments),
  };
}

// -- Composite message converters (depend on the leaf converters) --

export function userMessageToContentBlocks(
  message: BaseUserMessage,
  converters: MessageBlockConverters
): MessageParam["content"] {
  switch (message.type) {
    case "text":
      return [converters.userTextMessageToTextBlock(message)];
    case "image_url":
      return [converters.userImageMessageToImageBlock(message)];
    case "tool_call_result":
      return [converters.toolCallResultMessageToToolResultBlock(message)];
    default:
      assertNever(message);
  }
}

export function assistantMessageToContentBlocks(
  message: BaseAssistantMessage,
  converters: MessageBlockConverters
): MessageParam["content"] {
  switch (message.type) {
    case "text":
      return [converters.assistantTextMessageToTextBlock(message)];
    case "reasoning":
      return converters.assistantReasoningMessageToThinkingBlocks(message);
    case "tool_call_request":
      return [converters.assistantToolCallRequestToToolUseBlock(message)];
    default:
      assertNever(message);
  }
}

export function conversationToMessages(
  conversation: BaseConversation,
  converters: MessageBlockConverters
): MessageParam[] {
  return conversation.messages.map((message) => {
    switch (message.role) {
      case "user":
        return {
          role: "user",
          content: userMessageToContentBlocks(message, converters),
        };
      case "assistant":
        return {
          role: "assistant",
          content: assistantMessageToContentBlocks(message, converters),
        };
      default:
        assertNever(message);
    }
  });
}

export function systemMessagesToSystemParam(
  system: SystemTextMessage[],
  converters: MessageBlockConverters
): TextBlockParam[] {
  return system.map((message) => converters.systemMessageToTextBlock(message));
}

// -- Config converters (pure) --

export function outputFormatToOutputConfig(outputFormat: OutputFormat): {
  format: NonNullable<OutputConfig["format"]>;
} {
  return {
    format: {
      type: "json_schema",
      schema: outputFormat.json_schema.schema,
    },
  };
}

export function toolSpecToAnthropicTool(tool: ToolSpecification): Tool {
  return {
    name: tool.name,
    description: tool.description,
    // Stream tool-call arguments eagerly to avoid hangs on long arguments.
    // Anthropic no longer validates the JSON, so callers validate at content_block_stop.
    // https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
    eager_input_streaming: true,
    input_schema: { type: "object", ...tool.inputSchema },
  };
}

export function forceToolNameToToolChoice(
  tools: ToolSpecification[],
  forceTool: string | undefined
): ToolChoiceAuto | ToolChoiceTool {
  return forceTool && tools.some((tool) => tool.name === forceTool)
    ? { type: "tool", name: forceTool }
    : { type: "auto" };
}

function effortToAnthropicEffort(
  effort: (typeof ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS)[number]
): NonNullable<OutputConfig["effort"]> {
  switch (effort) {
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
      assertNever(effort);
  }
}

export function reasoningToThinkingConfig(
  reasoning: AnthropicInputConfig["reasoning"]
):
  | {
      output_config: { effort: NonNullable<OutputConfig["effort"]> };
      thinking: ThinkingConfigAdaptive;
    }
  | {
      thinking: ThinkingConfigDisabled;
    } {
  if (!reasoning || reasoning.effort === "none") {
    return { thinking: { type: "disabled" } };
  }

  return {
    output_config: { effort: effortToAnthropicEffort(reasoning.effort) },
    thinking: { type: "adaptive" },
  };
}
