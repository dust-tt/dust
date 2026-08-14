import type {
  CacheControlEphemeral,
  ContentBlockParam,
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
  ToolChoiceNone,
  ToolChoiceTool,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import type { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { TOOL_SEARCH_TOOL } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import { parseAnthropicToolSearchBlock } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search_passthrough";
import type {
  OutputFormat,
  ToolChoiceInput,
  ToolSpecification,
} from "@app/lib/model_constructors/types/input/configuration";
import type {
  BaseAssistantMessage,
  BaseAssistantProviderPassthroughMessage,
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
import { ANTHROPIC_LAB } from "@app/lib/model_constructors/types/labs";
import { isToolDeferred } from "@app/lib/model_constructors/types/tool_search";
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

// This SDK client is shared across hosts and labs (direct Anthropic, Vertex,
// Bedrock, ...). The goal is to let a specific endpoint override one small
// conversion step (e.g. how a user text message becomes a text block) without
// reimplementing the whole `buildRequestPayload`.
//
// To make that possible, conversions are split into two kinds:
//
//   - "leaf" converters (this interface): the smallest units, each turning one
//     Base* message into one Anthropic block. E.g. `userTextMessageToTextBlock`,
//     `imageUrlToImageBlock`. These are the override points.
//
//   - "composite" converters (defined below): higher-level converters that
//     assemble blocks by delegating to leaves rather than doing the leaf work
//     themselves. E.g. `userMessageToContentBlocks` switches on message type and
//     calls `userTextMessageToTextBlock` / `imageUrlToImageBlock`.
//
// The link between them is that composites receive an object satisfying this
// interface (`this` on the endpoint class — see `WithAnthropicAIInputConverter`)
// and route every child call through it. So overriding a single leaf field on an
// endpoint (e.g. Vertex swaps `imageUrlToImageBlock` for a base64 variant)
// changes how every composite depending on it behaves — no need to touch the
// composites or `buildRequestPayload`.
//
// This composes both ways: a composite is itself an override point. An endpoint
// can override a composite method and still reach its children through
// `this.<child>` (e.g. a custom `userMessageToContentBlocks` that calls
// `this.userTextMessageToTextBlock`), so it picks up any leaf overrides too and
// only the reassembly logic changes.
//
// "leaf" / "composite" naming lives only in comments; it's just a mental model
// for how the pieces compose.
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
  assistantProviderPassthroughMessageToBlocks(
    message: BaseAssistantProviderPassthroughMessage
  ): MessageParam["content"];
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

export function assistantProviderPassthroughMessageToBlocks(
  message: BaseAssistantProviderPassthroughMessage
): MessageParam["content"] {
  // Replay the provider's own tool-search blocks verbatim so interleaved
  // thinking signatures stay valid. Skip blocks tagged for another provider or
  // that fail to parse.
  if (message.content.provider !== ANTHROPIC_LAB) {
    return [];
  }

  const parsed = parseAnthropicToolSearchBlock(message.content.block);
  return parsed ? [parsed] : [];
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
    case "provider_passthrough":
      return converters.assistantProviderPassthroughMessageToBlocks(message);
    default:
      assertNever(message);
  }
}

function contentToBlocks(
  content: MessageParam["content"]
): ContentBlockParam[] {
  return typeof content === "string"
    ? [{ type: "text", text: content }]
    : content;
}

export async function conversationToMessages(
  conversation: BaseConversation,
  converters: MessageBlockConverters
): Promise<MessageParam[]> {
  const messages = await concurrentExecutor(
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

  // Anthropic rejects consecutive same-role messages, so merge them: one
  // logical turn arrives split into a message per content block (e.g. text +
  // image).
  return messages.reduce<MessageParam[]>((merged, message) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      return [
        ...merged.slice(0, -1),
        {
          ...previous,
          content: [
            ...contentToBlocks(previous.content),
            ...contentToBlocks(message.content),
          ],
        },
      ];
    }
    return [...merged, message];
  }, []);
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

export function toolSpecToAnthropicAITool(
  tool: ToolSpecification,
  toolSearchEnabled: boolean
): Tool {
  return {
    name: tool.name,
    description: tool.description,
    // Stream tool-call arguments eagerly to avoid hangs on long arguments.
    // Anthropic no longer validates the JSON, so callers validate at content_block_stop.
    // https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
    eager_input_streaming: true,
    input_schema: { type: "object", ...tool.inputSchema },
    // Defer non-eager tools behind tool search when it is enabled. Eager tools
    // (and every tool when tool search is off) stay in the cached prefix. Only
    // set when true so non-deferred tools serialize identically (stable bytes).
    ...(isToolDeferred(tool, toolSearchEnabled) ? { defer_loading: true } : {}),
  };
}

export function toolSpecsToAnthropicAITools(
  tools: ToolSpecification[],
  {
    forceTool,
    toolSearchEnabled,
  }: { forceTool: string | undefined; toolSearchEnabled: boolean }
): Array<Tool | typeof TOOL_SEARCH_TOOL> {
  const converted = tools.map((tool) =>
    // A forced tool cannot be deferred: the API requires the tool_choice target
    // to be loaded, so treat it as eager.
    toolSpecToAnthropicAITool(
      tool.name === forceTool ? { ...tool, eager: true } : tool,
      toolSearchEnabled
    )
  );

  // The tool search tool is only needed when at least one tool is actually deferred.
  return converted.some((tool) => tool.defer_loading)
    ? [TOOL_SEARCH_TOOL, ...converted]
    : converted;
}

export function forceToolNameToToolChoice(
  tools: ToolSpecification[],
  { forceTool, disableToolUse }: ToolChoiceInput
): ToolChoiceAuto | ToolChoiceTool | ToolChoiceNone {
  if (forceTool && tools.some((tool) => tool.name === forceTool)) {
    return { type: "tool", name: forceTool };
  }

  // The tools stay in the request so historical tool_search_tool_result references keep resolving,
  // but tool calls are forbidden to force a final generation (last agent step).
  if (disableToolUse) {
    return { type: "none" };
  }

  return { type: "auto" };
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

// An absent `reasoning` and an explicit effort of "none" are different
// requests, so they map to different payloads: "none" sends
// `thinking: {type: "disabled"}`, while an absent `reasoning` sends no thinking
// config at all and lets the model apply its own default. Conflating the two
// would send "disabled" to models that reject it (Fable 5 400s on
// `thinking.type.disabled`) and would silently turn thinking off on models
// whose default is adaptive.
//
// In practice every Anthropic model schema either defaults `reasoning` to an
// effort or pins it to "none", so the empty case is unreachable today — it
// exists because the converter is typed against the wide `AnthropicInputConfig`
// rather than a per-model config.
export type ReasoningToThinkingConfig = (
  reasoning: AnthropicInputConfig["reasoning"]
) =>
  | {
      output_config: { effort: NonNullable<OutputConfig["effort"]> };
      thinking: ThinkingConfigAdaptive;
    }
  | { thinking: ThinkingConfigEnabled }
  | { thinking: ThinkingConfigDisabled }
  | Record<string, never>;

// Adaptive thinking; extended-thinking-only models swap in
// `reasoningToExtendedThinkingConfig`.
export const reasoningToThinkingConfig: ReasoningToThinkingConfig = (
  reasoning
): ReturnType<ReasoningToThinkingConfig> => {
  if (!reasoning) {
    return {};
  }

  if (reasoning.effort === "none") {
    return { thinking: { type: "disabled" } };
  }

  return {
    output_config: { effort: effortToAnthropicEffort(reasoning.effort) },
    thinking: { type: "adaptive", display: "summarized" },
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
): ReturnType<ReasoningToThinkingConfig> => {
  if (!reasoning) {
    return {};
  }

  if (reasoning.effort === "none") {
    return { thinking: { type: "disabled" } };
  }

  return {
    thinking: {
      type: "enabled",
      budget_tokens: EXTENDED_THINKING_BUDGET_TOKENS[reasoning.effort],
    },
  };
};
