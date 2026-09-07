import {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "@anthropic-ai/sdk";
import type { BetaMessageBatchResult } from "@anthropic-ai/sdk/resources/beta/messages/batches";
import type {
  BetaCacheCreation,
  BetaMessage,
  BetaMessageDeltaUsage,
  BetaRawContentBlockDeltaEvent,
  BetaRawContentBlockStartEvent,
  BetaRawContentBlockStopEvent,
  BetaRawMessageDeltaEvent,
  BetaRawMessageStartEvent,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parseToolArguments } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import {
  logToolSearchQuery,
  logToolSearchResult,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/tool_search_logging";
import { isAnthropicFileDownloadError } from "@app/lib/model_constructors/sdk/anthropic_ai/errors";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import { ANTHROPIC_LAB } from "@app/lib/model_constructors/types/labs";
import type {
  ErrorEvent,
  ErrorSource,
  ErrorType,
  ModelResponseEvent,
  NonDeltaResponseEvent,
  ProviderPassthroughEvent,
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
  buildHttpStatusErrorEvent,
  httpErrorMessage,
} from "@app/lib/model_constructors/utils/classify_http_status";
import { classifyStreamError } from "@app/lib/model_constructors/utils/classify_stream_error";
import logger from "@app/logger/logger";
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

// The SDK surfaces a malformed tool-call JSON as a raw `JSON.parse` SyntaxError,
// either bare or as the `cause` of an AnthropicError. `partialParse` tolerates
// truncation and only throws on genuinely malformed input, so this is always bad
// model output, never a transport cut.
function isBareToolJsonParseError(err: unknown): boolean {
  if (err instanceof SyntaxError) {
    return true;
  }
  return (
    err instanceof AnthropicError &&
    "cause" in err &&
    err.cause instanceof SyntaxError
  );
}

// The raw malformed tool JSON when a stream aborted on a tool-call parse
// failure, or null if unrelated. When the SDK embeds it in the error message
// (after `JSON: `) we use that; otherwise we recover from the buffer accumulated
// so far, which is enough for the agent loop to re-sample.
function invalidToolJsonFromStreamError(
  err: unknown,
  accumulator: string
): string | null {
  const wrapped = getInvalidToolJsonMessage(err);
  if (wrapped !== null) {
    return wrapped.slice(
      wrapped.lastIndexOf(INVALID_JSON_MARKER) + INVALID_JSON_MARKER.length
    );
  }
  return isBareToolJsonParseError(err) ? accumulator : null;
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
    }
  // Server-side tool search (e.g. tool_search_tool_bm25). The query streams in
  // as input_json_delta chunks on a server_tool_use block, accumulating here
  // like a regular tool call's arguments.
  | {
      index: number;
      accumulator: string;
      type: "tool_search";
      toolName: string;
      // The server_tool_use block id, needed to replay the block verbatim.
      toolId: string;
    };

// The per-signal leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface OutputEventConverters {
  messageStartToResponseIdEvent(
    metadata: EndpointMetadata,
    event: BetaRawMessageStartEvent
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
  serverToolBlockToProviderPassthroughEvent(
    metadata: EndpointMetadata,
    block: unknown
  ): ProviderPassthroughEvent;
  messageDeltaUsageToTokenUsageEvent(
    metadata: EndpointMetadata,
    usage: BetaMessageDeltaUsage,
    cacheCreation: BetaCacheCreation | null
  ): TokenUsageEvent;
  stopReasonToErrorEvent(
    metadata: EndpointMetadata,
    stopReason: string
  ): ErrorEvent | null;
  streamErrorToErrorEvent(
    metadata: EndpointMetadata,
    error: unknown
  ): ErrorEvent;
}

// -- Leaf converters: one unified event per Anthropic stream signal --

export function messageStartToResponseIdEvent(
  metadata: EndpointMetadata,
  event: BetaRawMessageStartEvent
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

export function serverToolBlockToProviderPassthroughEvent(
  metadata: EndpointMetadata,
  block: unknown
): ProviderPassthroughEvent {
  return {
    type: "provider_passthrough",
    content: { provider: ANTHROPIC_LAB, block },
    metadata,
  };
}

export function messageDeltaUsageToTokenUsageEvent(
  metadata: EndpointMetadata,
  usage: BetaMessageDeltaUsage,
  cacheCreation: BetaCacheCreation | null
): TokenUsageEvent {
  const cacheHit = usage.cache_read_input_tokens ?? 0;
  const uncachedInput = usage.input_tokens ?? 0;
  // Anthropic defines output_tokens as the inclusive, authoritative billed
  // output total. thinking_tokens is an optional subset for observability.
  // https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost
  const thinkingTokens = usage.output_tokens_details?.thinking_tokens;

  // The per-TTL breakdown lives on the full `Usage` object (`cache_creation`),
  // not on `MessageDeltaUsage`. When it's present, split cache creation into the
  // 1h (long) and 5m (short) buckets and leave `cacheCreated` at 0. Otherwise we
  // only know the flat total, so report it as `cacheCreated` and leave both
  // per-TTL buckets at 0 — consumers fall back to `long + short` only when
  // `cacheCreated` is 0.
  let cacheCreated = 0;
  let longCacheCreated = 0;
  let shortCacheCreated = 0;
  if (cacheCreation) {
    longCacheCreated = cacheCreation.ephemeral_1h_input_tokens;
    shortCacheCreated = cacheCreation.ephemeral_5m_input_tokens;
  } else {
    cacheCreated = usage.cache_creation_input_tokens ?? 0;
  }

  return {
    type: "token_usage",
    content: {
      cacheCreated,
      longCacheCreated,
      shortCacheCreated,
      cacheHit,
      standardInput: uncachedInput,
      totalOutput: usage.output_tokens,
      ...(thinkingTokens !== undefined ? { reasoning: thinkingTokens } : {}),
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
        errorSource: "dust",
        metadata,
        type: "stop_error",
        message: "The maximum response length was reached.",
      });
    case "refusal":
      return buildErrorEvent({
        errorSource: "dust",
        metadata,
        type: "refusal_error",
        message:
          "Claude safety filters prevented this response. Try starting a new conversation or rephrasing your request.",
      });
    default:
      return null;
  }
}

function isApiConnectionError(err: unknown): err is APIConnectionError {
  return err instanceof APIConnectionError;
}

function isApiConnectionTimeoutError(
  err: unknown
): err is APIConnectionTimeoutError {
  return err instanceof APIConnectionTimeoutError;
}

function isApiUserAbortError(err: unknown): err is APIUserAbortError {
  return err instanceof APIUserAbortError;
}

function isApiError(err: unknown): err is APIError {
  return err instanceof APIError;
}

function apiErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: APIError
): ErrorEvent {
  // Anthropic can intermittently fail to download a signed image URL included in a long agent run and returns HTTP 400 with "Unable to download the file".
  // Classify only this exact Anthropic diagnostic as a retryable server error.
  if (isAnthropicFileDownloadError(error)) {
    return buildErrorEvent({
      errorSource: "dust",
      metadata,
      type: "server_error",
      message: httpErrorMessage({
        type: "server_error",
        provider: "Anthropic",
        detail: error.message,
      }),
      originalError: error,
    });
  }

  // Mid-stream SSE `error` events surface as an `APIError` with no HTTP status;
  // the old router defaulted those to 500, so mirror that here.
  return buildHttpStatusErrorEvent({
    metadata,
    status: error.status ?? 500,
    provider: "Anthropic",
    detail: error.message,
    originalError: error,
  });
}

// Maps any error thrown by the Anthropic SDK while streaming into a unified
// `ErrorEvent`, so everything leaving the endpoint is an event, not an exception.
export function streamErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: unknown
): ErrorEvent {
  // Invalid tool-call JSON is an expected, retryable model-output failure. Its
  // source stays unknown because malformed output alone cannot distinguish a
  // provider model issue from bad tool instructions or schema on our side.
  if (getInvalidToolJsonMessage(error) !== null) {
    return buildErrorEvent({
      errorSource: "unknown",
      metadata,
      type: "model_output_error",
      message: `Model generated invalid tool call JSON for ${metadata.model}.`,
      originalError: error,
    });
  }

  // These SDK classes all extend APIError, so handle them before typed HTTP.
  if (isApiUserAbortError(error)) {
    return classifyStreamError({
      error,
      metadata,
      providerName: "Anthropic",
      sdkClass: "abort",
    });
  }
  if (isApiConnectionTimeoutError(error)) {
    return classifyStreamError({
      error,
      metadata,
      providerName: "Anthropic",
      sdkClass: "timeout",
    });
  }
  if (isApiConnectionError(error)) {
    return classifyStreamError({
      error,
      metadata,
      providerName: "Anthropic",
      sdkClass: "connection",
    });
  }
  if (isApiError(error)) {
    return apiErrorToErrorEvent(metadata, error);
  }

  return classifyStreamError({
    error,
    metadata,
    providerName: "Anthropic",
  });
}

// -- Composite state machine: depends on the leaf converters --

// Returns the events to emit alongside the next block state, so the caller owns
// the cursor instead of us mutating it in place.
export function contentBlockStartToEvents(
  event: BetaRawContentBlockStartEvent,
  state: BlockState | null,
  metadata: EndpointMetadata,
  converters: OutputEventConverters,
  toolSearchQuery?: string
): [ModelResponseEvent[], BlockState | null] {
  const block = event.content_block;
  switch (block.type) {
    case "text":
      return [[], { index: event.index, accumulator: "", type: "text" }];
    case "thinking":
      return [[], { index: event.index, accumulator: "", type: "reasoning" }];
    case "tool_use":
      return [
        [
          converters.toolUseBlockStartToToolCallStartedEvent(
            metadata,
            block.id,
            event.index,
            block.name
          ),
        ],
        {
          index: event.index,
          accumulator: "",
          type: "tool_use",
          toolId: block.id,
          toolName: block.name,
        },
      ];

    case "server_tool_use":
      // The only server tool we enable is tool search. Accumulate the query
      // deltas, then emit the block as passthrough at content_block_stop.
      return [
        [],
        {
          index: event.index,
          accumulator: "",
          type: "tool_search",
          toolName: block.name,
          toolId: block.id,
        },
      ];

    case "tool_search_tool_result":
      // Discovered references arrive inline (no deltas). Emit a passthrough for
      // verbatim replay and log them. State stays null, so the stop is a no-op.
      logToolSearchResult({
        content: block.content,
        query: toolSearchQuery,
        logFields: toolSearchLogFields(metadata),
      });
      return [
        [
          converters.serverToolBlockToProviderPassthroughEvent(metadata, {
            type: "tool_search_tool_result",
            tool_use_id: block.tool_use_id,
            content: block.content,
          }),
        ],
        null,
      ];

    // Block types we don't surface: redacted thinking, other server tools, and
    // their result / container blocks. Listed explicitly so the default stays
    // exhaustive.
    case "redacted_thinking":
    case "web_search_tool_result":
    case "web_fetch_tool_result":
    case "code_execution_tool_result":
    case "bash_code_execution_tool_result":
    case "text_editor_code_execution_tool_result":
    case "container_upload":
    case "advisor_tool_result":
    case "mcp_tool_use":
    case "mcp_tool_result":
    case "compaction":
    case "fallback":
      return [[], state];
    default:
      // Anthropic may add new block types before we redeploy; ignore them
      // rather than crashing the stream.
      assertNeverAndIgnore(block);
      return [[], state];
  }
}

export function contentBlockDeltaToEvents(
  event: BetaRawContentBlockDeltaEvent,
  state: BlockState | null,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): [ModelResponseEvent[], BlockState | null] {
  if (state === null) {
    return [[], null];
  }
  const delta = event.delta;
  switch (delta.type) {
    case "text_delta":
      return [
        [converters.textDeltaToTextDeltaEvent(metadata, delta.text)],
        { ...state, accumulator: state.accumulator + delta.text },
      ];
    case "thinking_delta":
      return [
        [
          converters.reasoningDeltaToReasoningDeltaEvent(
            metadata,
            delta.thinking
          ),
        ],
        { ...state, accumulator: state.accumulator + delta.thinking },
      ];
    case "input_json_delta":
      return [
        [converters.inputJsonDeltaToToolCallDeltaEvent(metadata)],
        { ...state, accumulator: state.accumulator + delta.partial_json },
      ];
    case "signature_delta":
      if (state.type === "reasoning") {
        // Accumulate across deltas: Anthropic may chunk the signature.
        return [
          [],
          { ...state, signature: (state.signature ?? "") + delta.signature },
        ];
      }
      return [[], state];
    case "citations_delta":
    case "compaction_delta":
      return [[], state];
    default:
      // Anthropic may add new delta types before we redeploy; ignore them
      // rather than crashing the stream.
      assertNeverAndIgnore(delta);
      return [[], state];
  }
}

// Flushes the in-progress block as an event and clears the cursor (returns the
// next state as `null`), so the caller resets its own variable.
export function contentBlockStopToEvents(
  _event: BetaRawContentBlockStopEvent,
  state: BlockState | null,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): [ModelResponseEvent[], BlockState | null] {
  if (state === null) {
    return [[], null];
  }
  const block = state;
  switch (block.type) {
    case "text":
      return [
        [converters.accumulatedTextToTextEvent(metadata, block.accumulator)],
        null,
      ];
    case "reasoning":
      return [
        [
          converters.accumulatedReasoningToReasoningEvent(
            metadata,
            block.accumulator,
            block.signature || undefined
          ),
        ],
        null,
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
            [
              converters.invalidJsonToolCallToToolCallEvent(
                metadata,
                block.toolId,
                block.toolName,
                input
              ),
            ],
            null,
          ];
        }
      }
      return [
        [
          converters.accumulatedToolCallToToolCallEvent(
            metadata,
            block.toolId,
            block.toolName,
            input
          ),
        ],
        null,
      ];
    }

    case "tool_search": {
      // Replay the server_tool_use block verbatim so interleaved thinking
      // signatures stay valid, falling back to an empty input if the query
      // failed to parse.
      const parsedInput = safeParseJSON(block.accumulator);
      return [
        [
          converters.serverToolBlockToProviderPassthroughEvent(metadata, {
            type: "server_tool_use",
            id: block.toolId,
            name: block.toolName,
            input: parsedInput.isOk() ? parsedInput.value : {},
          }),
        ],
        null,
      ];
    }

    default:
      assertNever(block);
  }
}

// Maps endpoint metadata into the structured log fields shared by both tool
// search log lines.
function toolSearchLogFields(metadata: EndpointMetadata) {
  return {
    providerId: metadata.lab,
    api: metadata.host,
    modelId: metadata.model,
  };
}

// Returns the events to emit alongside the latest usage snapshot, so the caller
// tracks token usage in its own variable instead of us writing into a wrapper.
export function messageDeltaToEvents(
  event: BetaRawMessageDeltaEvent,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): [ModelResponseEvent[], BetaMessageDeltaUsage] {
  const stopReason = event.delta.stop_reason;
  if (stopReason) {
    // Anthropic pauses a turn when the server-side sampling loop reaches its
    // iteration limit while running server tools (tool search in our case).
    // The recommended handling is to re-issue the request with the paused
    // assistant response appended so the model can finish:
    // https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#pause-turn
    // We do not continue yet: the turn ends with the content produced so far.
    // Logged to measure how often this truncation happens before implementing
    // the continuation.
    if (stopReason === "pause_turn") {
      logger.warn(
        {
          providerId: metadata.lab,
          api: metadata.host,
          modelId: metadata.model,
        },
        "Anthropic pause_turn stop reason, turn ended with partial content"
      );
    }
    const errorEvent = converters.stopReasonToErrorEvent(metadata, stopReason);
    if (errorEvent) {
      return [[errorEvent], event.usage];
    }
  }
  return [[], event.usage];
}

// -- Entry point: drive the raw stream into unified events --

export async function* rawOutputToEvents(
  stream: AsyncGenerator<BetaRawMessageStreamEvent>,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): AsyncGenerator<ModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  let blockState: BlockState | null = null;
  let tokenUsage: BetaMessageDeltaUsage | null = null;
  let stopReason: string | null = null;
  const toolSearchQueriesByToolUseId = new Map<string, string | undefined>();
  // The per-TTL cache-creation breakdown is only emitted on `message_start`;
  // capture it so the trailing `message_delta` usage can be split by TTL.
  let cacheCreation: BetaCacheCreation | null = null;

  while (true) {
    let result: IteratorResult<BetaRawMessageStreamEvent>;
    try {
      result = await stream.next();
    } catch (err) {
      // Invalid tool-call JSON aborts the stream while the tool_use block is
      // still open. Recover by emitting a tool_call wrapping the raw JSON so the
      // agent loop can hand it back and let the model self-correct, instead of
      // surfacing a terminal error.
      if (blockState !== null && blockState.type === "tool_use") {
        const invalidJson = invalidToolJsonFromStreamError(
          err,
          blockState.accumulator
        );
        if (invalidJson !== null) {
          const ev = converters.invalidJsonToolCallToToolCallEvent(
            metadata,
            blockState.toolId,
            blockState.toolName,
            invalidJson
          );
          aggregated.push(ev);
          yield ev;
          blockState = null;
          break;
        }
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

    let outputEvents: ModelResponseEvent[];
    switch (event.type) {
      case "message_start":
        cacheCreation = event.message.usage?.cache_creation ?? null;
        outputEvents = [
          converters.messageStartToResponseIdEvent(metadata, event),
        ];
        break;
      case "message_stop":
        outputEvents = [];
        break;
      case "content_block_start": {
        const toolSearchQuery =
          event.content_block.type === "tool_search_tool_result"
            ? toolSearchQueriesByToolUseId.get(event.content_block.tool_use_id)
            : undefined;
        const [events, nextState] = contentBlockStartToEvents(
          event,
          blockState,
          metadata,
          converters,
          toolSearchQuery
        );
        if (event.content_block.type === "tool_search_tool_result") {
          toolSearchQueriesByToolUseId.delete(event.content_block.tool_use_id);
        }
        outputEvents = events;
        blockState = nextState;
        break;
      }
      case "content_block_delta": {
        const [events, nextState] = contentBlockDeltaToEvents(
          event,
          blockState,
          metadata,
          converters
        );
        outputEvents = events;
        blockState = nextState;
        break;
      }
      case "content_block_stop": {
        if (blockState?.type === "tool_search") {
          const query = logToolSearchQuery({
            rawInput: blockState.accumulator,
            toolName: blockState.toolName,
            tags: [
              `provider_id:${metadata.lab}`,
              `api:${metadata.host}`,
              `model_id:${metadata.model}`,
            ],
            logFields: toolSearchLogFields(metadata),
          });
          toolSearchQueriesByToolUseId.set(blockState.toolId, query);
        }
        const [events, nextState] = contentBlockStopToEvents(
          event,
          blockState,
          metadata,
          converters
        );
        outputEvents = events;
        blockState = nextState;
        break;
      }
      case "message_delta": {
        const [events, usage] = messageDeltaToEvents(
          event,
          metadata,
          converters
        );
        outputEvents = events;
        tokenUsage = usage;
        stopReason = event.delta.stop_reason ?? stopReason;
        break;
      }
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

  if (tokenUsage !== null) {
    yield converters.messageDeltaUsageToTokenUsageEvent(
      metadata,
      tokenUsage,
      cacheCreation
    );
  }

  yield {
    type: "success",
    content: { aggregated, ...(stopReason ? { stopReason } : {}) },
    metadata,
  };
}

// -- Non-streaming entry point: complete message → events --

// Turns a completed (non-streaming) Anthropic `Message` into the unified event
// array, mirroring `rawOutputToEvents` minus the streaming-only delta heartbeats.
export function messageToEvents(
  message: BetaMessage,
  metadata: EndpointMetadata,
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
      case "server_tool_use":
      case "tool_search_tool_result":
        // Replay tool-search blocks verbatim so interleaved thinking signatures
        // stay valid.
        events.push(
          converters.serverToolBlockToProviderPassthroughEvent(metadata, block)
        );
        break;
      // Block types we don't surface: redacted thinking, other server tools, and
      // their result / container blocks. Listed explicitly so the default stays
      // exhaustive.
      case "redacted_thinking":
      case "web_search_tool_result":
      case "web_fetch_tool_result":
      case "code_execution_tool_result":
      case "bash_code_execution_tool_result":
      case "text_editor_code_execution_tool_result":
      case "container_upload":
      // Beta-only blocks (both clients use the beta API); also unsurfaced.
      case "advisor_tool_result":
      case "mcp_tool_use":
      case "mcp_tool_result":
      case "compaction":
      case "fallback":
        break;
      default:
        // Anthropic may add new block types before we redeploy; ignore them
        // rather than crashing.
        assertNeverAndIgnore(block);
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
    converters.messageDeltaUsageToTokenUsageEvent(
      metadata,
      message.usage,
      message.usage.cache_creation
    )
  );

  events.push({ type: "success", content: { aggregated }, metadata });

  return events;
}

function classifyAnthropicApiErrorType(errorType: string): {
  errorSource: ErrorSource;
  type: ErrorType;
} {
  switch (errorType) {
    case "invalid_request_error":
      return { errorSource: "dust", type: "invalid_request_error" };
    case "authentication_error":
      return { errorSource: "dust", type: "authentication_error" };
    case "permission_error":
      return { errorSource: "dust", type: "permission_error" };
    case "not_found_error":
      return { errorSource: "dust", type: "not_found_error" };
    case "rate_limit_error":
      return { errorSource: "dust", type: "rate_limit_error" };
    case "overloaded_error":
      return { errorSource: "provider", type: "overloaded_error" };
    case "api_error":
      return { errorSource: "provider", type: "server_error" };
    default:
      return { errorSource: "unknown", type: "unknown_error" };
  }
}

// Converts a single Anthropic batch result into unified events.
export function batchResultToEvents(
  result: BetaMessageBatchResult,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): NonDeltaResponseEvent[] {
  switch (result.type) {
    case "succeeded":
      return messageToEvents(result.message, metadata, converters);
    case "errored": {
      const { errorSource, type } = classifyAnthropicApiErrorType(
        result.error.error.type
      );
      return [
        buildErrorEvent({
          errorSource,
          metadata,
          type,
          message: httpErrorMessage({
            type,
            provider: "Anthropic",
            detail: result.error.error.message,
            model: metadata.model,
          }),
          originalError: result.error,
        }),
      ];
    }
    case "canceled":
      return [
        buildErrorEvent({
          errorSource: "provider",
          metadata,
          type: "stream_error",
          message: "Batch request was canceled.",
        }),
      ];
    case "expired":
      return [
        buildErrorEvent({
          errorSource: "provider",
          metadata,
          type: "stream_error",
          message: "Batch request expired before processing completed.",
        }),
      ];
    default:
      // Anthropic may add new batch result types before we redeploy; ignore
      // them rather than crashing.
      assertNeverAndIgnore(result);
      return [];
  }
}
