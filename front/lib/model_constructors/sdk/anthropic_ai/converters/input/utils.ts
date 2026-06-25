import type {
  CacheControlEphemeral,
  ImageBlockParam,
  MessageParam,
  OutputConfig,
  TextBlockParam,
  ThinkingBlockParam,
  ThinkingConfigAdaptive,
  ThinkingConfigDisabled,
  ThinkingConfigEnabled,
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
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isRecord } from "@app/types/shared/utils/general";
import { trustedFetchImageBase64 } from "@app/types/shared/utils/image_utils";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

const MESSAGE_CONVERSION_CONCURRENCY = 10;

const SUPPORTED_IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

function isSupportedImageMediaType(
  mediaType: string
): mediaType is SupportedImageMediaType {
  return SUPPORTED_IMAGE_MEDIA_TYPES.some((t) => t === mediaType);
}

// Kept byte-identical to the legacy AnthropicLLM client so the model-visible
// fallback text is iso across the router migration (typo included).
const IMAGE_LOAD_FAILED_TEXT = "Attachment: image could not be loaded.";
const UNSUPPORTED_MEDIA_TYPE_TEXT =
  "Attachement: an unsupported media type was provided.";

// The per-message leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface MessageBlockConverters {
  systemMessageToTextBlock(message: SystemTextMessage): TextBlockParam;
  userTextMessageToTextBlock(message: BaseUserTextMessage): TextBlockParam;
  // The single provider-specific image conversion point, shared by user image
  // messages and tool-result image parts (mirrors the legacy client). Direct
  // Anthropic keeps the URL source; Vertex overrides it to inline base64.
  imageUrlToImageBlock(url: string): Promise<ImageBlockParam | TextBlockParam>;
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

export async function imageUrlToImageBlock(
  url: string
): Promise<ImageBlockParam> {
  return { type: "image", source: { type: "url", url } };
}

// Vertex AI rejects URL image sources, so fetch the bytes and inline them as
// base64, degrading to a text note rather than failing the whole request.
export async function imageUrlToBase64ImageBlock(
  url: string
): Promise<ImageBlockParam | TextBlockParam> {
  let fetchResult: Awaited<ReturnType<typeof trustedFetchImageBase64>>;
  try {
    fetchResult = await trustedFetchImageBase64(url);
  } catch (err) {
    // Don't log the URL: conversation image URLs are signed GCS URLs ([SEC1]).
    logger.warn(
      { err: normalizeError(err) },
      "Failed to fetch image for base64 inlining; using text placeholder."
    );
    return { type: "text", text: IMAGE_LOAD_FAILED_TEXT };
  }

  const { mediaType, data } = fetchResult;
  if (!isSupportedImageMediaType(mediaType)) {
    logger.warn(
      { mediaType },
      "Unsupported image media type for base64 inlining; using text placeholder."
    );
    return { type: "text", text: UNSUPPORTED_MEDIA_TYPE_TEXT };
  }

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data },
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

export async function userImageMessageToImageBlock(
  message: BaseUserImageMessage,
  converters: MessageBlockConverters
): Promise<ImageBlockParam | TextBlockParam> {
  const block = await converters.imageUrlToImageBlock(message.content.url);
  return { ...block, ...cacheControlFor(message.cache) };
}

export async function toolCallResultMessageToToolResultBlock(
  message: BaseToolCallResultMessage,
  converters: MessageBlockConverters
): Promise<ToolResultBlockParam> {
  const content = await concurrentExecutor(
    message.content.parts,
    (part): Promise<TextBlockParam | ImageBlockParam> => {
      switch (part.type) {
        case "text":
          return Promise.resolve({ type: "text", text: part.text });
        case "image_url":
          return converters.imageUrlToImageBlock(part.url);
        default:
          return assertNever(part);
      }
    },
    { concurrency: MESSAGE_CONVERSION_CONCURRENCY }
  );
  return {
    type: "tool_result",
    tool_use_id: message.content.callId,
    content,
    ...(message.content.isError ? { is_error: true } : {}),
    ...cacheControlFor(message.cache),
  };
}

export async function userMessageToContentBlocks(
  message: BaseUserMessage,
  converters: MessageBlockConverters
): Promise<MessageParam["content"]> {
  switch (message.type) {
    case "text":
      return [converters.userTextMessageToTextBlock(message)];
    case "image_url":
      return [await userImageMessageToImageBlock(message, converters)];
    case "tool_call_result":
      return [
        await toolCallResultMessageToToolResultBlock(message, converters),
      ];
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
): Promise<MessageParam[]> {
  return concurrentExecutor(
    conversation.messages,
    async (message): Promise<MessageParam> => {
      switch (message.role) {
        case "user":
          return {
            role: "user",
            content: await userMessageToContentBlocks(message, converters),
          };
        case "assistant":
          return {
            role: "assistant",
            content: assistantMessageToContentBlocks(message, converters),
          };
        default:
          assertNever(message);
      }
    },
    { concurrency: MESSAGE_CONVERSION_CONCURRENCY }
  );
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

export function toolSpecToAnthropicAITool(tool: ToolSpecification): Tool {
  return {
    name: tool.name,
    description: tool.description,
    // Stream tool-call arguments eagerly to avoid hangs on long arguments.
    // Anthropic no longer validates the JSON, so callers validate at content_block_stop.
    // https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
    eager_input_streaming: true,
    input_schema: { type: "object", ...tool.inputSchema },
    // Only set when true so non-deferred tools serialize identically (stable prefix bytes).
    ...(tool.deferLoading ? { defer_loading: true } : {}),
  };
}

// Search tool that lets the model discover deferred tools on demand. Prepended
// to the tools array whenever at least one tool is deferred.
const TOOL_SEARCH_TOOL = {
  type: "tool_search_tool_bm25_20251119",
  name: "tool_search_tool_bm25",
} as const;

export function toolSpecsToAnthropicAITools(
  tools: ToolSpecification[],
  { forceTool }: { forceTool: string | undefined }
): Array<Tool | typeof TOOL_SEARCH_TOOL> {
  const converted = tools.map((tool) =>
    // A forced tool cannot be deferred: the API requires the tool_choice target
    // to be loaded, so treat it as non-deferred.
    toolSpecToAnthropicAITool(
      tool.name === forceTool ? { ...tool, deferLoading: false } : tool
    )
  );

  // The tool search tool is only needed when at least one tool is actually deferred.
  return converted.some((tool) => tool.defer_loading)
    ? [TOOL_SEARCH_TOOL, ...converted]
    : converted;
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

export type ReasoningToThinkingConfig = (
  reasoning: AnthropicInputConfig["reasoning"]
) =>
  | {
      output_config: { effort: NonNullable<OutputConfig["effort"]> };
      thinking: ThinkingConfigAdaptive;
    }
  | { thinking: ThinkingConfigEnabled }
  | { thinking: ThinkingConfigDisabled };

// Adaptive thinking; extended-thinking-only models swap in
// `reasoningToExtendedThinkingConfig`.
export const reasoningToThinkingConfig: ReasoningToThinkingConfig = (
  reasoning
) => {
  if (!reasoning || reasoning.effort === "none") {
    return { thinking: { type: "disabled" } };
  }

  return {
    output_config: { effort: effortToAnthropicEffort(reasoning.effort) },
    thinking: { type: "adaptive" },
  };
};

// low/medium/high mirror the legacy budget mapping (1024 minimum); xhigh/maximal
// extend it. budget_tokens must be >= 1024 and < max_tokens.
const EXTENDED_THINKING_BUDGET_TOKENS = {
  low: 1_024,
  medium: 1_024,
  high: 4_096,
  xhigh: 8_192,
  maximal: 16_384,
} as const;

// Extended thinking for models without adaptive-thinking support (e.g. Haiku 4.5).
export const reasoningToExtendedThinkingConfig: ReasoningToThinkingConfig = (
  reasoning
) => {
  if (!reasoning || reasoning.effort === "none") {
    return { thinking: { type: "disabled" } };
  }

  return {
    thinking: {
      type: "enabled",
      budget_tokens: EXTENDED_THINKING_BUDGET_TOKENS[reasoning.effort],
    },
  };
};
