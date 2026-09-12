import { OPENAI_TOOL_SEARCH_TOOL } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/tool_search";
import { parseOpenAIToolSearchItem } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/tool_search_passthrough";
import type {
  OutputFormat,
  Reasoning,
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
import { isToolDeferred } from "@app/lib/model_constructors/types/tool_search";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  FunctionTool,
  ResponseFormatTextJSONSchemaConfig,
  ResponseInputItem,
  ResponseInputText,
  Tool,
  ToolChoiceFunction,
} from "openai/resources/responses/responses";
import type { Reasoning as OpenAIReasoning } from "openai/resources/shared";

export type OpenAIReasoningSummary = NonNullable<OpenAIReasoning["summary"]>;

type PromptCacheBreakpoint =
  | {
      prompt_cache_breakpoint: NonNullable<
        ResponseInputText["prompt_cache_breakpoint"]
      >;
    }
  | Record<string, never>;

// This SDK client is shared across hosts and labs. The goal is to let a
// specific endpoint override one small conversion step (e.g. how a user image
// message becomes an input item) without reimplementing the whole
// `buildRequestPayload`.
//
// To make that possible, conversions are split into two kinds:
//
//   - "leaf" converters (this interface): the smallest units, each turning one
//     Base* message into one (or a few) Responses input item(s). E.g.
//     `userImageMessageToInputItem`, `assistantTextMessageToInputItem`. These
//     are the override points.
//
//   - "composite" converters (defined below): higher-level converters that
//     assemble input items by delegating to leaves rather than doing the leaf
//     work themselves. E.g. `userMessageToInputItems` switches on message type
//     and calls `userImageMessageToInputItem` / `toolCallResultMessageToInputItem`.
//
// The link between them is that composites receive an object satisfying this
// interface (`this` on the endpoint class — see
// `WithOpenAIResponsesInputConverter`) and route every child call through it. So
// overriding a single leaf field on an endpoint changes how every composite
// depending on it behaves — no need to touch the composites or
// `buildRequestPayload`.
//
// This composes both ways: a composite is itself an override point. An endpoint
// can override a composite method and still reach its children through
// `this.<child>` (e.g. a custom `userMessageToInputItems` that calls
// `this.userImageMessageToInputItem`), so it picks up any leaf overrides too and
// only the reassembly logic changes.
//
// "leaf" / "composite" naming lives only in comments; it's just a mental model
// for how the pieces compose.
export interface MessageItemConverters {
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
  assistantProviderPassthroughMessageToInputItems(
    message: BaseAssistantProviderPassthroughMessage
  ): ResponseInputItem[];
  promptCacheBreakpointFor(
    cache: CacheOption | undefined
  ): PromptCacheBreakpoint;
}

// -- Small, reusable building blocks --

// Spreadable fragment adding an explicit breakpoint only when the message opts
// in and the model supports it. OpenAI applies one request-wide TTL, so both
// cache durations map to the same wire representation.
export function promptCacheBreakpointFor(
  cache: CacheOption | undefined
): PromptCacheBreakpoint {
  switch (cache) {
    case "short":
    case "long":
      // Link to the doc: https://developers.openai.com/api/docs/guides/prompt-caching
      // We can create up to 4 new cache writes (i.e. 4 cache breakpoints).
      // We can't control the TTL, it's set to 30min (they may change this in the future).
      return { prompt_cache_breakpoint: { mode: "explicit" } };
    case undefined:
      return {};
    default:
      return assertNever(cache);
  }
}

// -- Leaf converters: one Responses input item per message --

// OpenAI uses the "developer" role for the system prompt on reasoning models.
export function systemMessageToInputItem(
  message: SystemTextMessage,
  converters: MessageItemConverters
): ResponseInputItem {
  return {
    role: "developer",
    content: [
      {
        type: "input_text",
        text: message.content.value,
        ...converters.promptCacheBreakpointFor(message.cache),
      },
    ],
  };
}

export function userTextMessageToInputItem(
  message: BaseUserTextMessage,
  converters: MessageItemConverters
): ResponseInputItem {
  return {
    role: "user",
    content: [
      {
        type: "input_text",
        text: message.content.value,
        ...converters.promptCacheBreakpointFor(message.cache),
      },
    ],
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
  return {
    role: "assistant",
    content: message.content.value,
    ...(message.phase ? { phase: message.phase } : {}),
  };
}

export function assistantReasoningMessageToInputItems(
  message: BaseAssistantReasoningMessage
): ResponseInputItem[] {
  // The Responses API keys a replayed reasoning item by its original id, which
  // we carry in `signature`; drop unsigned items (mirrors dropping unsigned
  // Anthropic thinking blocks). The region guard for `encryptedContent` lives in
  // the transition layer, where region config is available.
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
      ...(message.encryptedContent
        ? { encrypted_content: message.encryptedContent }
        : {}),
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
    namespace: message.content.namespace,
  };
}

export function assistantProviderPassthroughMessageToInputItems(
  message: BaseAssistantProviderPassthroughMessage
): ResponseInputItem[] {
  if (message.content.provider !== "openai") {
    return [];
  }

  const item = parseOpenAIToolSearchItem(message.content.block);
  return item ? [item] : [];
}

// -- Composite message converters (depend on the leaf converters) --

export function userMessageToInputItems(
  message: BaseUserMessage,
  converters: MessageItemConverters
): ResponseInputItem[] {
  switch (message.type) {
    case "text":
      return [userTextMessageToInputItem(message, converters)];
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
    case "provider_passthrough":
      return converters.assistantProviderPassthroughMessageToInputItems(
        message
      );
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
  return system.map((message) => systemMessageToInputItem(message, converters));
}

// -- Config converters (pure) --

export function toFunctionTool(
  tool: ToolSpecification,
  { toolSearchEnabled = false }: { toolSearchEnabled?: boolean } = {}
): FunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    // Tool input schemas are not authored for OpenAI strict mode (which requires
    // every property to be listed in `required`), so keep strict off — matching
    // the core provider, which sends `strict: false` for function tools.
    strict: false,
    parameters: { type: "object", ...tool.inputSchema },
    ...(isToolDeferred(tool, toolSearchEnabled) ? { defer_loading: true } : {}),
  };
}

// Tools named by a replayed call that carries no namespace. A tool loaded
// through the Responses tool search lives in a namespace of its own, and the
// replayed tool_search_output item that loaded it puts that namespace back in
// the request. A call to it must then name the namespace, or the request is
// rejected with "Missing namespace for function_call". Calls produced by
// another provider (or before the tool was deferred) carry no namespace, so
// their tool has to stay reachable in the default namespace.
export function toolNamesCalledWithoutNamespace(
  conversation: BaseConversation
): Set<string> {
  const names = new Set<string>();
  for (const message of conversation.messages) {
    if (
      message.role === "assistant" &&
      message.type === "tool_call_request" &&
      !message.content.namespace
    ) {
      names.add(message.content.toolName);
    }
  }
  return names;
}

export function toolSpecsToOpenAITools(
  tools: ToolSpecification[],
  {
    forceTool,
    toolSearchEnabled,
    toolNamesRequiringDefaultNamespace,
  }: {
    forceTool: string | undefined;
    toolSearchEnabled: boolean;
    toolNamesRequiringDefaultNamespace: Set<string>;
  }
): Tool[] {
  const converted = tools.map((tool) =>
    // A forced tool cannot be deferred: the API requires the tool_choice target
    // to be loaded. Neither can one that a namespaceless call replays: it
    // resolves against the default namespace.
    toFunctionTool(tool, {
      toolSearchEnabled:
        toolSearchEnabled &&
        tool.name !== forceTool &&
        !toolNamesRequiringDefaultNamespace.has(tool.name),
    })
  );

  return converted.some((tool) => tool.defer_loading)
    ? [OPENAI_TOOL_SEARCH_TOOL, ...converted]
    : converted;
}

export function forceToolToToolChoice(
  tools: ToolSpecification[],
  { forceTool, disableToolUse }: ToolChoiceInput
): ToolChoiceFunction | "auto" | "none" {
  if (forceTool && tools.some((tool) => tool.name === forceTool)) {
    return { type: "function", name: forceTool };
  }

  if (disableToolUse) {
    return "none";
  }

  return "auto";
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

export function reasoningToOpenAIResponsesReasoning(
  reasoning: Reasoning | undefined,
  summary: OpenAIReasoningSummary = "auto"
): OpenAIReasoning | undefined {
  if (!reasoning) {
    return undefined;
  }

  if (reasoning.effort === "maximal") {
    return { effort: "max", summary };
  }

  return { effort: reasoning.effort, summary };
}
