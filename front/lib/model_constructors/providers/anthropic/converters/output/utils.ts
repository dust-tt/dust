import {
  AnthropicError,
  APIConnectionError,
  APIError,
} from "@anthropic-ai/sdk";
import type { MessageBatchResult } from "@anthropic-ai/sdk/resources/messages/batches";
import type {
  Message,
  MessageDeltaUsage,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageDeltaEvent,
  RawMessageStartEvent,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { parseToolArguments } from "@app/lib/model_constructors/providers/anthropic/converters/input/utils";
import type {
  ErrorEvent,
  EventMetadata,
  LargeLanguageModelResponseEvent,
  NonDeltaResponseEvent,
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
import { buildErrorEvent } from "@app/lib/model_constructors/types/output/events";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isRecord } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// Eager input streaming can produce invalid JSON. We validate inputs below this
// size to avoid spending time parsing very large payloads.
const MAX_EAGER_VALIDATION_INPUT_LENGTH = 5_000;
const INVALID_JSON_MARKER = "JSON: ";
const INVALID_TOOL_JSON_NEEDLE = "Unable to parse tool parameter JSON";

/**
 * Type guard for an APIError whose body carries the nested error.message with
 * the invalid-tool-JSON diagnostic from the Anthropic API (server-side detection).
 */
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

/**
 * Type guard for an AnthropicError thrown by the SDK's stream when it fails to
 * parse tool parameter JSON client-side.
 */
function isAnthropicInvalidToolJsonError(err: unknown): err is AnthropicError {
  return (
    err instanceof AnthropicError &&
    err.message.includes(INVALID_TOOL_JSON_NEEDLE) &&
    err.message.includes(INVALID_JSON_MARKER)
  );
}

/**
 * Extracts the error message from an Anthropic "Unable to parse tool parameter
 * JSON" error, or returns null if the error is unrelated. Two shapes are
 * possible:
 *  1. APIError (server-side): the API aborts the stream with an SSE error event.
 *     The message lives at err.error.error.message.
 *  2. AnthropicError (client-side): the SDK stream fails to parse partial tool
 *     JSON. The message is on err.message.
 * Both end with `JSON: <raw invalid json>`.
 */
export function getInvalidToolJsonMessage(err: unknown): string | null {
  if (isApiInvalidToolJsonError(err)) {
    return err.error.error.message;
  }
  if (isAnthropicInvalidToolJsonError(err)) {
    return err.message;
  }
  return null;
}

/**
 * Cursor tracking the content block currently being streamed. Deltas accumulate
 * here until `content_block_stop` flushes the completed block as an event.
 */
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

/**
 * The per-signal leaf converters. The composite helpers below take an object
 * that satisfies this interface (the converter instance, `this`), so overriding
 * a single leaf on a model endpoint changes how every composite uses it.
 */
export interface OutputEventConverters {
  messageStartToResponseIdEvent(
    metadata: EventMetadata,
    event: RawMessageStartEvent
  ): ResponseIdEvent;
  textDeltaToTextDeltaEvent(
    metadata: EventMetadata,
    delta: string
  ): TextDeltaEvent;
  reasoningDeltaToReasoningDeltaEvent(
    metadata: EventMetadata,
    delta: string
  ): ReasoningDeltaEvent;
  accumulatedTextToTextEvent(metadata: EventMetadata, text: string): TextEvent;
  accumulatedReasoningToReasoningEvent(
    metadata: EventMetadata,
    text: string,
    signature?: string
  ): ReasoningEvent;
  toolUseBlockStartToToolCallStartedEvent(
    metadata: EventMetadata,
    id: string,
    index: number,
    name: string
  ): ToolCallStartedEvent;
  inputJsonDeltaToToolCallDeltaEvent(
    metadata: EventMetadata
  ): ToolCallDeltaEvent;
  accumulatedToolCallToToolCallEvent(
    metadata: EventMetadata,
    id: string,
    name: string,
    argumentsJson: string
  ): ToolCallEvent;
  invalidJsonToolCallToToolCallEvent(
    metadata: EventMetadata,
    id: string,
    name: string,
    invalidJson: string
  ): ToolCallEvent;
  messageDeltaUsageToTokenUsageEvent(
    metadata: EventMetadata,
    usage: MessageDeltaUsage
  ): TokenUsageEvent;
  stopReasonToErrorEvent(
    metadata: EventMetadata,
    stopReason: string
  ): ErrorEvent | null;
  streamErrorToErrorEvent(metadata: EventMetadata, error: unknown): ErrorEvent;
}

// -- Leaf converters: one unified event per Anthropic stream signal --

export function messageStartToResponseIdEvent(
  metadata: EventMetadata,
  event: RawMessageStartEvent
): ResponseIdEvent {
  return {
    type: "response_id",
    content: { responseId: event.message.id },
    metadata,
  };
}

export function textDeltaToTextDeltaEvent(
  metadata: EventMetadata,
  delta: string
): TextDeltaEvent {
  return { type: "text_delta", content: { value: delta }, metadata };
}

export function reasoningDeltaToReasoningDeltaEvent(
  metadata: EventMetadata,
  delta: string
): ReasoningDeltaEvent {
  return { type: "reasoning_delta", content: { value: delta }, metadata };
}

export function accumulatedTextToTextEvent(
  metadata: EventMetadata,
  text: string
): TextEvent {
  return { type: "text", content: { value: text }, metadata };
}

export function accumulatedReasoningToReasoningEvent(
  metadata: EventMetadata,
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
  metadata: EventMetadata,
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
  metadata: EventMetadata
): ToolCallDeltaEvent {
  return { type: "tool_call_delta", metadata };
}

export function accumulatedToolCallToToolCallEvent(
  metadata: EventMetadata,
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

/**
 * Wraps invalid tool-call JSON in a `{ INVALID_JSON: ... }` argument so the
 * agent loop can send it back as a tool result and let the model self-correct.
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming#handling-invalid-json-in-tool-responses
 */
export function invalidJsonToolCallToToolCallEvent(
  metadata: EventMetadata,
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
  metadata: EventMetadata,
  usage: MessageDeltaUsage
): TokenUsageEvent {
  const cacheCreated = usage.cache_creation_input_tokens ?? 0;
  const cacheHit = usage.cache_read_input_tokens ?? 0;
  const uncachedInput = usage.input_tokens ?? 0;
  // thinking_tokens is the raw reasoning portion of output_tokens; subtracting
  // yields non-reasoning generation. The field is null on non-reasoning
  // responses and on streams where the API does not surface a breakdown — in
  // which case reasoning rolls into standardOutput, same as before.
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
  metadata: EventMetadata,
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

/**
 * Maps an error thrown by the Anthropic SDK while streaming (network failure,
 * HTTP error by status, or anything else) into a unified `ErrorEvent`, so that
 * everything leaving the endpoint is an event rather than a thrown exception.
 */
export function streamErrorToErrorEvent(
  metadata: EventMetadata,
  error: unknown
): ErrorEvent {
  // The model produced invalid tool-call JSON and the API/SDK aborted the stream
  // without an in-progress tool_use block to recover from. Surface a distinct,
  // retryable type so the agent loop can re-sample rather than treating it as a
  // terminal invalid_request_error.
  if (getInvalidToolJsonMessage(error) !== null) {
    return buildErrorEvent({
      metadata,
      type: "model_output_error",
      message: `Model generated invalid tool call JSON for ${metadata.modelId}.`,
      originalError: error,
    });
  }

  if (error instanceof APIConnectionError) {
    return buildErrorEvent({
      metadata,
      type: "network_error",
      message: `Network error connecting to Anthropic: ${error.message}`,
      originalError: error,
    });
  }

  if (error instanceof APIError) {
    const status = error.status;

    switch (status) {
      case 400:
      case 422:
        return buildErrorEvent({
          metadata,
          type: "invalid_request_error",
          message: `Invalid request to Anthropic: ${error.message}`,
          originalError: error,
        });
      case 401:
        return buildErrorEvent({
          metadata,
          type: "authentication_error",
          message: `Authentication failed for Anthropic: ${error.message}`,
          originalError: error,
        });
      case 403:
        return buildErrorEvent({
          metadata,
          type: "permission_error",
          message: `Permission denied for Anthropic: ${error.message}`,
          originalError: error,
        });
      case 404:
        return buildErrorEvent({
          metadata,
          type: "not_found_error",
          message: `Resource not found for Anthropic: ${error.message}`,
          originalError: error,
        });
      case 429:
        return buildErrorEvent({
          metadata,
          type: "rate_limit_error",
          message: `Rate limit exceeded for Anthropic/${metadata.modelId}: ${error.message}`,
          originalError: error,
        });
      case 503:
        return buildErrorEvent({
          metadata,
          type: "overloaded_error",
          message: `Anthropic is overloaded: ${error.message}`,
          originalError: error,
        });
      default:
        if (status >= 500 && status < 600) {
          return buildErrorEvent({
            metadata,
            type: "server_error",
            message: `Server error from Anthropic (${status}): ${error.message}`,
            originalError: error,
          });
        }

        return buildErrorEvent({
          metadata,
          type: "unknown_error",
          message: `Error from Anthropic (${status}): ${error.message}`,
          originalError: error,
        });
    }
  }

  return buildErrorEvent({
    metadata,
    type: "unknown_error",
    message: `Unknown error from Anthropic`,
    originalError: error,
  });
}

// -- Composite state machine: depends on the leaf converters --

export function contentBlockStartToEvents(
  event: RawContentBlockStartEvent,
  state: { current: BlockState | null },
  metadata: EventMetadata,
  converters: OutputEventConverters
): LargeLanguageModelResponseEvent[] {
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
    case "redacted_thinking":
    case "server_tool_use":
    case "web_search_tool_result":
      return [];
    default:
      return [];
  }
}

export function contentBlockDeltaToEvents(
  event: RawContentBlockDeltaEvent,
  state: { current: BlockState | null },
  metadata: EventMetadata,
  converters: OutputEventConverters
): LargeLanguageModelResponseEvent[] {
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
      assertNever(delta);
  }
}

export function contentBlockStopToEvents(
  _event: RawContentBlockStopEvent,
  state: { current: BlockState | null },
  metadata: EventMetadata,
  converters: OutputEventConverters
): LargeLanguageModelResponseEvent[] {
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
  metadata: EventMetadata,
  converters: OutputEventConverters
): LargeLanguageModelResponseEvent[] {
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
  metadata: EventMetadata,
  converters: OutputEventConverters
): AsyncGenerator<LargeLanguageModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const blockState: { current: BlockState | null } = { current: null };
  const tokenUsageState: { usage: MessageDeltaUsage | null } = { usage: null };

  while (true) {
    let result: IteratorResult<RawMessageStreamEvent>;
    try {
      result = await stream.next();
    } catch (err) {
      // Anthropic sometimes aborts the stream with an error when the model
      // produces invalid tool parameter JSON — server-side via APIError, or
      // client-side via AnthropicError from the SDK's stream. If a tool_use
      // block is in progress, recover by emitting a tool_call wrapping the
      // invalid JSON so the agent loop can send it back and let the model
      // self-correct.
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
      // Everything leaving the endpoint is an event: map any other SDK error to
      // a unified error event and terminate the stream rather than throwing.
      yield converters.streamErrorToErrorEvent(metadata, err);
      return;
    }
    if (result.done) {
      break;
    }

    const event = result.value;

    let outputEvents: LargeLanguageModelResponseEvent[];
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
        assertNever(event);
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

// -- Non-streaming entry point: convert a complete message (e.g. a batch
//    result) into the same events the streaming path produces, reusing the
//    leaf converters so batch and stream stay in lock-step. --

/**
 * Turns a completed (non-streaming) Anthropic `Message` into the unified event
 * array. Mirrors what `rawOutputToEvents` would have yielded for the same
 * response, minus the delta heartbeats which only exist while streaming.
 */
export function messageToEvents(
  message: Message,
  metadata: EventMetadata,
  converters: OutputEventConverters
): NonDeltaResponseEvent[] {
  const events: NonDeltaResponseEvent[] = [];
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];

  events.push({
    type: "response_id",
    content: { responseId: message.id },
    metadata,
  });

  message.content.forEach((block, index) => {
    switch (block.type) {
      case "text": {
        const event = converters.accumulatedTextToTextEvent(
          metadata,
          block.text
        );
        aggregated.push(event);
        events.push(event);
        break;
      }
      case "thinking": {
        const event = converters.accumulatedReasoningToReasoningEvent(
          metadata,
          block.thinking,
          block.signature || undefined
        );
        aggregated.push(event);
        events.push(event);
        break;
      }
      case "tool_use": {
        events.push(
          converters.toolUseBlockStartToToolCallStartedEvent(
            metadata,
            block.id,
            index,
            block.name
          )
        );
        // Non-streaming responses carry the input as an already-parsed object;
        // re-serialize so the shared converter (which parses) handles it.
        const event = converters.accumulatedToolCallToToolCallEvent(
          metadata,
          block.id,
          block.name,
          JSON.stringify(block.input)
        );
        aggregated.push(event);
        events.push(event);
        break;
      }
      default:
        // Ignore block types we don't surface (redacted_thinking, server tools).
        break;
    }
  });

  if (message.stop_reason) {
    const errorEvent = converters.stopReasonToErrorEvent(
      metadata,
      message.stop_reason
    );
    if (errorEvent) {
      events.push(errorEvent);
    }
  }

  events.push(
    converters.messageDeltaUsageToTokenUsageEvent(metadata, message.usage)
  );

  events.push({ type: "success", content: { aggregated }, metadata });

  return events;
}

/**
 * Converts a single Anthropic batch result into unified events, mirroring what
 * the streaming path would have produced for the same request.
 */
export function batchResultToEvents(
  result: MessageBatchResult,
  metadata: EventMetadata,
  converters: OutputEventConverters
): NonDeltaResponseEvent[] {
  switch (result.type) {
    case "succeeded":
      return messageToEvents(result.message, metadata, converters);
    case "errored":
      return [
        buildErrorEvent({
          metadata,
          type: "server_error",
          message: result.error.error.message,
          originalError: result.error,
        }),
      ];
    case "canceled":
      return [
        buildErrorEvent({
          metadata,
          type: "stream_error",
          message: "Batch request was canceled.",
        }),
      ];
    case "expired":
      return [
        buildErrorEvent({
          metadata,
          type: "stream_error",
          message: "Batch request expired before processing completed.",
        }),
      ];
    default:
      assertNever(result);
  }
}
