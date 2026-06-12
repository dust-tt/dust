import { AnthropicError, APIError } from "@anthropic-ai/sdk";
import type {
  MessageDeltaUsage,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageDeltaEvent,
  RawMessageStartEvent,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { parseToolArguments } from "@app/lib/model_constructors/providers/anthropic/converters/input/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ModelResponseEvent,
  ReasoningDeltaEvent,
  ReasoningEvent,
  ResponseIdEvent,
  TextDeltaEvent,
  TextEvent,
  TokenUsageEvent,
  ToolCallDeltaEvent,
  ToolCallEvent,
  ToolCallStartedEvent,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import { isRecord } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// Eager input streaming can produce invalid JSON. We validate inputs below this
// size to avoid spending time parsing very large payloads.
const MAX_EAGER_VALIDATION_INPUT_LENGTH = 5_000;
const INVALID_JSON_MARKER = "JSON: ";
const INVALID_TOOL_JSON_NEEDLE = "Unable to parse tool parameter JSON";

// Type guard: APIError carrying the server-side invalid-tool-JSON diagnostic.
function isApiInvalidToolJsonError(
  err: unknown
): err is APIError & { error: { error: { message: string } } } {
  if (!(err instanceof APIError) || err.type !== "invalid_request_error") {
    return false;
  }
  const body = err.error;
  if (typeof body !== "object" || body === null || !isRecord(body)) {
    return false;
  }
  const innerError = body.error;
  if (
    typeof innerError !== "object" ||
    innerError === null ||
    !isRecord(innerError)
  ) {
    return false;
  }
  const { message } = innerError;
  return (
    typeof message === "string" &&
    message.includes(INVALID_TOOL_JSON_NEEDLE) &&
    message.includes(INVALID_JSON_MARKER)
  );
}

// Type guard: AnthropicError thrown when the SDK fails to parse tool JSON client-side.
function isAnthropicInvalidToolJsonError(err: unknown): err is AnthropicError {
  return (
    err instanceof AnthropicError &&
    err.message.includes(INVALID_TOOL_JSON_NEEDLE) &&
    err.message.includes(INVALID_JSON_MARKER)
  );
}

// Extracts the "Unable to parse tool parameter JSON" message (ending in
// `JSON: <raw>`) from either an APIError (server-side) or AnthropicError
// (client-side), or null if unrelated.
export function getInvalidToolJsonMessage(err: unknown): string | null {
  if (isApiInvalidToolJsonError(err)) {
    return err.error.error.message;
  }
  if (isAnthropicInvalidToolJsonError(err)) {
    return err.message;
  }
  return null;
}

// Cursor for the content block being streamed; deltas accumulate here until
// `content_block_stop` flushes it as an event.
export type BlockState =
  | {
      index: number;
      accumulator: string;
      type: "text" | "reasoning";
      signature?: string;
    }
  | {
      index: number;
      accumulator: string;
      type: "tool_use";
      toolId: string;
      toolName: string;
    };

// The per-signal leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface OutputEventConverters {
  messageStartToResponseIdEvent(
    metadata: EndpointMetadata,
    event: RawMessageStartEvent
  ): ResponseIdEvent;
  textDeltaToTextDeltaEvent(
    metadata: EndpointMetadata,
    delta: string
  ): TextDeltaEvent;
  reasoningDeltaToReasoningDeltaEvent(
    metadata: EndpointMetadata,
    delta: string
  ): ReasoningDeltaEvent;
  accumulatedTextToTextEvent(
    metadata: EndpointMetadata,
    text: string
  ): TextEvent;
  accumulatedReasoningToReasoningEvent(
    metadata: EndpointMetadata,
    text: string,
    signature?: string
  ): ReasoningEvent;
  toolUseBlockStartToToolCallStartedEvent(
    metadata: EndpointMetadata,
    id: string,
    index: number,
    name: string
  ): ToolCallStartedEvent;
  inputJsonDeltaToToolCallDeltaEvent(
    metadata: EndpointMetadata
  ): ToolCallDeltaEvent;
  accumulatedToolCallToToolCallEvent(
    metadata: EndpointMetadata,
    id: string,
    name: string,
    argumentsJson: string
  ): ToolCallEvent;
  invalidJsonToolCallToToolCallEvent(
    metadata: EndpointMetadata,
    id: string,
    name: string,
    invalidJson: string
  ): ToolCallEvent;
  messageDeltaUsageToTokenUsageEvent(
    metadata: EndpointMetadata,
    usage: MessageDeltaUsage
  ): TokenUsageEvent;
  stopReasonToErrorEvent(
    metadata: EndpointMetadata,
    stopReason: string
  ): ErrorEvent | null;
}

// -- Leaf converters: one unified event per Anthropic stream signal --

export function messageStartToResponseIdEvent(
  metadata: EndpointMetadata,
  event: RawMessageStartEvent
): ResponseIdEvent {
  return {
    type: "response_id",
    content: { responseId: event.message.id },
    metadata,
  };
}

export function textDeltaToTextDeltaEvent(
  metadata: EndpointMetadata,
  delta: string
): TextDeltaEvent {
  return { type: "text_delta", content: { value: delta }, metadata };
}

export function reasoningDeltaToReasoningDeltaEvent(
  metadata: EndpointMetadata,
  delta: string
): ReasoningDeltaEvent {
  return { type: "reasoning_delta", content: { value: delta }, metadata };
}

export function accumulatedTextToTextEvent(
  metadata: EndpointMetadata,
  text: string
): TextEvent {
  return { type: "text", content: { value: text }, metadata };
}

export function accumulatedReasoningToReasoningEvent(
  metadata: EndpointMetadata,
  text: string,
  signature?: string
): ReasoningEvent {
  return {
    type: "reasoning",
    content: { value: text },
    metadata: {
      ...metadata,
      ...(signature ? { content: { signature } } : {}),
    },
  };
}

export function toolUseBlockStartToToolCallStartedEvent(
  metadata: EndpointMetadata,
  id: string,
  index: number,
  name: string
): ToolCallStartedEvent {
  return {
    type: "tool_call_started",
    content: { id, index, name },
    metadata,
  };
}

export function inputJsonDeltaToToolCallDeltaEvent(
  metadata: EndpointMetadata
): ToolCallDeltaEvent {
  return { type: "tool_call_delta", metadata };
}

export function accumulatedToolCallToToolCallEvent(
  metadata: EndpointMetadata,
  id: string,
  name: string,
  argumentsJson: string
): ToolCallEvent {
  return {
    type: "tool_call",
    content: { id, name, arguments: parseToolArguments(argumentsJson) },
    metadata,
  };
}

// Wraps invalid tool-call JSON in `{ INVALID_JSON: ... }` so the agent loop can
// send it back and let the model self-correct.
// https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming#handling-invalid-json-in-tool-responses
export function invalidJsonToolCallToToolCallEvent(
  metadata: EndpointMetadata,
  id: string,
  name: string,
  invalidJson: string
): ToolCallEvent {
  return {
    type: "tool_call",
    content: { id, name, arguments: { INVALID_JSON: invalidJson } },
    metadata,
  };
}

export function messageDeltaUsageToTokenUsageEvent(
  metadata: EndpointMetadata,
  usage: MessageDeltaUsage
): TokenUsageEvent {
  const cacheCreated = usage.cache_creation_input_tokens ?? 0;
  const cacheHit = usage.cache_read_input_tokens ?? 0;
  const uncachedInput = usage.input_tokens ?? 0;
  // thinking_tokens is the reasoning portion of output_tokens; subtracting
  // yields non-reasoning generation. Null (no breakdown) rolls reasoning into
  // standardOutput.
  const thinkingTokens = usage.output_tokens_details?.thinking_tokens ?? 0;

  return {
    type: "token_usage",
    content: {
      cacheCreated,
      cacheHit,
      standardInput: uncachedInput,
      standardOutput: usage.output_tokens - thinkingTokens,
      reasoning: thinkingTokens,
    },
    metadata,
  };
}

export function stopReasonToErrorEvent(
  metadata: EndpointMetadata,
  stopReason: string
): ErrorEvent | null {
  switch (stopReason) {
    case "max_tokens":
      return buildErrorEvent({
        metadata,
        type: "stop_error",
        message: "The maximum response length was reached.",
      });
    case "refusal":
      return buildErrorEvent({
        metadata,
        type: "refusal_error",
        message:
          "Claude safety filters prevented this response. Try starting a new conversation or rephrasing your request.",
      });
    default:
      return null;
  }
}

// -- Composite state machine: depends on the leaf converters --

export function contentBlockStartToEvents(
  event: RawContentBlockStartEvent,
  state: { current: BlockState | null },
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): ModelResponseEvent[] {
  const block = event.content_block;
  switch (block.type) {
    case "text":
      state.current = { index: event.index, accumulator: "", type: "text" };
      return [];
    case "thinking":
      state.current = {
        index: event.index,
        accumulator: "",
        type: "reasoning",
      };
      return [];
    case "tool_use":
      state.current = {
        index: event.index,
        accumulator: "",
        type: "tool_use",
        toolId: block.id,
        toolName: block.name,
      };
      return [
        converters.toolUseBlockStartToToolCallStartedEvent(
          metadata,
          block.id,
          event.index,
          block.name
        ),
      ];
    // Block types we don't surface: redacted thinking, server tools, and their
    // result / container blocks. Listed explicitly so the default stays
    // exhaustive.
    case "redacted_thinking":
    case "server_tool_use":
    case "web_search_tool_result":
    case "web_fetch_tool_result":
    case "code_execution_tool_result":
    case "bash_code_execution_tool_result":
    case "text_editor_code_execution_tool_result":
    case "tool_search_tool_result":
    case "container_upload":
      return [];
    default:
      // Anthropic may add new block types before we redeploy; ignore them
      // rather than crashing the stream.
      assertNeverAndIgnore(block);
      return [];
  }
}

export function contentBlockDeltaToEvents(
  event: RawContentBlockDeltaEvent,
  state: { current: BlockState | null },
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): ModelResponseEvent[] {
  if (state.current === null) {
    return [];
  }
  const delta = event.delta;
  switch (delta.type) {
    case "text_delta":
      state.current.accumulator += delta.text;
      return [converters.textDeltaToTextDeltaEvent(metadata, delta.text)];
    case "thinking_delta":
      state.current.accumulator += delta.thinking;
      return [
        converters.reasoningDeltaToReasoningDeltaEvent(
          metadata,
          delta.thinking
        ),
      ];
    case "input_json_delta":
      state.current.accumulator += delta.partial_json;
      return [converters.inputJsonDeltaToToolCallDeltaEvent(metadata)];
    case "signature_delta":
      if (state.current.type === "reasoning") {
        // Accumulate across deltas: Anthropic may chunk the signature.
        state.current.signature =
          (state.current.signature ?? "") + delta.signature;
      }
      return [];
    case "citations_delta":
      return [];
    default:
      // Anthropic may add new delta types before we redeploy; ignore them
      // rather than crashing the stream.
      assertNeverAndIgnore(delta);
      return [];
  }
}

export function contentBlockStopToEvents(
  _event: RawContentBlockStopEvent,
  state: { current: BlockState | null },
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): ModelResponseEvent[] {
  if (state.current === null) {
    return [];
  }
  const block = state.current;
  state.current = null;
  switch (block.type) {
    case "text":
      return [
        converters.accumulatedTextToTextEvent(metadata, block.accumulator),
      ];
    case "reasoning":
      return [
        converters.accumulatedReasoningToReasoningEvent(
          metadata,
          block.accumulator,
          block.signature || undefined
        ),
      ];
    case "tool_use": {
      const input = block.accumulator;
      // With eager_input_streaming enabled, the model may produce invalid JSON.
      // Validate inputs below a size limit; if invalid, wrap as INVALID_JSON so
      // the agent loop can self-correct.
      if (
        input.length < MAX_EAGER_VALIDATION_INPUT_LENGTH &&
        input.trim() !== ""
      ) {
        const parsed = safeParseJSON(input);
        if (parsed.isErr()) {
          return [
            converters.invalidJsonToolCallToToolCallEvent(
              metadata,
              block.toolId,
              block.toolName,
              input
            ),
          ];
        }
      }
      return [
        converters.accumulatedToolCallToToolCallEvent(
          metadata,
          block.toolId,
          block.toolName,
          input
        ),
      ];
    }
    default:
      assertNever(block);
  }
}

export function messageDeltaToEvents(
  event: RawMessageDeltaEvent,
  tokenUsage: { usage: MessageDeltaUsage | null },
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): ModelResponseEvent[] {
  tokenUsage.usage = event.usage;
  const stopReason = event.delta.stop_reason;
  if (stopReason) {
    const errorEvent = converters.stopReasonToErrorEvent(metadata, stopReason);
    if (errorEvent) {
      return [errorEvent];
    }
  }
  return [];
}

// -- Entry point: drive the raw stream into unified events --

export async function* rawOutputToEvents(
  stream: AsyncGenerator<RawMessageStreamEvent>,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): AsyncGenerator<ModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const blockState: { current: BlockState | null } = { current: null };
  const tokenUsageState: { usage: MessageDeltaUsage | null } = { usage: null };

  while (true) {
    let result: IteratorResult<RawMessageStreamEvent>;
    try {
      result = await stream.next();
    } catch (err) {
      // On invalid tool JSON aborting the stream, if a tool_use block is in
      // progress, recover by emitting a tool_call wrapping the invalid JSON so
      // the agent loop can send it back and let the model self-correct.
      const invalidJsonMessage = getInvalidToolJsonMessage(err);
      if (
        invalidJsonMessage !== null &&
        blockState.current !== null &&
        blockState.current.type === "tool_use"
      ) {
        const invalidJson = invalidJsonMessage.slice(
          invalidJsonMessage.lastIndexOf(INVALID_JSON_MARKER) +
            INVALID_JSON_MARKER.length
        );
        const ev = converters.invalidJsonToolCallToToolCallEvent(
          metadata,
          blockState.current.toolId,
          blockState.current.toolName,
          invalidJson
        );
        aggregated.push(ev);
        yield ev;
        blockState.current = null;
        break;
      }
      // Generic stream-error mapping is wired in in a subsequent commit.
      return;
    }
    if (result.done) {
      break;
    }

    const event = result.value;

    let outputEvents: ModelResponseEvent[];
    switch (event.type) {
      case "message_start":
        outputEvents = [
          converters.messageStartToResponseIdEvent(metadata, event),
        ];
        break;
      case "message_stop":
        outputEvents = [];
        break;
      case "content_block_start":
        outputEvents = contentBlockStartToEvents(
          event,
          blockState,
          metadata,
          converters
        );
        break;
      case "content_block_delta":
        outputEvents = contentBlockDeltaToEvents(
          event,
          blockState,
          metadata,
          converters
        );
        break;
      case "content_block_stop":
        outputEvents = contentBlockStopToEvents(
          event,
          blockState,
          metadata,
          converters
        );
        break;
      case "message_delta":
        outputEvents = messageDeltaToEvents(
          event,
          tokenUsageState,
          metadata,
          converters
        );
        break;
      default:
        // Anthropic may add new stream event types before we redeploy; ignore
        // them rather than crashing the stream.
        assertNeverAndIgnore(event);
        outputEvents = [];
    }

    for (const outputEvent of outputEvents) {
      if (
        outputEvent.type === "text" ||
        outputEvent.type === "reasoning" ||
        outputEvent.type === "tool_call"
      ) {
        aggregated.push(outputEvent);
      }
      yield outputEvent;
    }
  }

  if (tokenUsageState.usage !== null) {
    yield converters.messageDeltaUsageToTokenUsageEvent(
      metadata,
      tokenUsageState.usage
    );
  }

  yield {
    type: "success",
    content: { aggregated },
    metadata,
  };
}
