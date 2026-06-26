import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ModelResponseEvent,
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
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import { isRecord } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { APIConnectionError, APIError } from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreatedEvent,
  ResponseOutputItem,
  ResponseStreamEvent,
  ResponseUsage,
} from "openai/resources/responses/responses";

// Parses tool-call arguments into an object, falling back to `{}` for malformed
// or non-object JSON.
function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  const parsed = safeParseJSON(argumentsJson);
  if (parsed.isErr() || parsed.value === null || !isRecord(parsed.value)) {
    return {};
  }
  return parsed.value;
}

// The per-signal leaf converters. Composites below take an object satisfying
// this interface (`this`), so overriding one leaf on an endpoint changes how
// every composite uses it.
export interface OutputEventConverters {
  responseCreatedToResponseIdEvent(
    metadata: EndpointMetadata,
    event: ResponseCreatedEvent
  ): ResponseIdEvent;
  textDeltaToTextDeltaEvent(
    metadata: EndpointMetadata,
    delta: string
  ): TextDeltaEvent;
  reasoningSummaryDeltaToReasoningDeltaEvent(
    metadata: EndpointMetadata,
    delta: string
  ): ReasoningDeltaEvent;
  functionCallToToolCallStartedEvent(
    metadata: EndpointMetadata,
    id: string,
    index: number,
    name: string
  ): ToolCallStartedEvent;
  argumentsDeltaToToolCallDeltaEvent(
    metadata: EndpointMetadata
  ): ToolCallDeltaEvent;
  accumulatedTextToTextEvent(
    metadata: EndpointMetadata,
    text: string,
    id?: string
  ): TextEvent;
  accumulatedReasoningToReasoningEvent(
    metadata: EndpointMetadata,
    text: string,
    id?: string,
    encryptedContent?: string
  ): ReasoningEvent;
  functionCallToToolCallEvent(
    metadata: EndpointMetadata,
    id: string,
    name: string,
    argumentsJson: string
  ): ToolCallEvent;
  usageToTokenUsageEvent(
    metadata: EndpointMetadata,
    usage: ResponseUsage
  ): TokenUsageEvent;
  streamErrorToErrorEvent(
    metadata: EndpointMetadata,
    error: unknown
  ): ErrorEvent;
}

// -- Leaf converters: one unified event per Responses stream signal --

export function responseCreatedToResponseIdEvent(
  metadata: EndpointMetadata,
  event: ResponseCreatedEvent
): ResponseIdEvent {
  return {
    type: "response_id",
    content: { responseId: event.response.id },
    metadata,
  };
}

export function textDeltaToTextDeltaEvent(
  metadata: EndpointMetadata,
  delta: string
): TextDeltaEvent {
  return { type: "text_delta", content: { value: delta }, metadata };
}

export function reasoningSummaryDeltaToReasoningDeltaEvent(
  metadata: EndpointMetadata,
  delta: string
): ReasoningDeltaEvent {
  return { type: "reasoning_delta", content: { value: delta }, metadata };
}

export function functionCallToToolCallStartedEvent(
  metadata: EndpointMetadata,
  id: string,
  index: number,
  name: string
): ToolCallStartedEvent {
  return { type: "tool_call_started", content: { id, index, name }, metadata };
}

export function argumentsDeltaToToolCallDeltaEvent(
  metadata: EndpointMetadata
): ToolCallDeltaEvent {
  return { type: "tool_call_delta", metadata };
}

export function accumulatedTextToTextEvent(
  metadata: EndpointMetadata,
  text: string,
  id?: string
): TextEvent {
  return {
    type: "text",
    content: { value: text },
    // Thread the message item id through so the input converter can resend it
    // on the next turn.
    metadata: { ...metadata, ...(id ? { content: { id } } : {}) },
  };
}

export function accumulatedReasoningToReasoningEvent(
  metadata: EndpointMetadata,
  text: string,
  id?: string,
  encryptedContent?: string
): ReasoningEvent {
  // The reasoning item id and its encrypted content are needed to resend the
  // reasoning item on the next turn (the Responses API requires both).
  const reasoningContent = {
    ...(id ? { id } : {}),
    ...(encryptedContent ? { encryptedContent } : {}),
  };
  return {
    type: "reasoning",
    content: { value: text },
    metadata: {
      ...metadata,
      ...(Object.keys(reasoningContent).length > 0
        ? { content: reasoningContent }
        : {}),
    },
  };
}

export function functionCallToToolCallEvent(
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

export function usageToTokenUsageEvent(
  metadata: EndpointMetadata,
  usage: ResponseUsage
): TokenUsageEvent {
  const cacheHit = usage.input_tokens_details?.cached_tokens ?? 0;
  const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0;
  return {
    type: "token_usage",
    content: {
      // OpenAI prompt caching has no separate creation cost, nor per-TTL
      // buckets.
      cacheCreated: 0,
      longCacheCreated: 0,
      shortCacheCreated: 0,
      cacheHit,
      // input_tokens includes cached; subtract to get the uncached portion.
      standardInput: usage.input_tokens - cacheHit,
      standardOutput: usage.output_tokens - reasoning,
      reasoning,
    },
    metadata,
  };
}

function isApiConnectionError(err: unknown): err is APIConnectionError {
  return err instanceof APIConnectionError;
}

function isApiError(err: unknown): err is APIError {
  return err instanceof APIError;
}

// A stream error classified into the categories we surface. `APIConnectionError`
// is checked before `APIError` since the former extends the latter.
type ClassifiedStreamError =
  | { kind: "connection"; error: APIConnectionError }
  | { kind: "api"; error: APIError }
  | { kind: "unknown" };

function classifyStreamError(error: unknown): ClassifiedStreamError {
  if (isApiConnectionError(error)) {
    return { kind: "connection", error };
  }
  if (isApiError(error)) {
    return { kind: "api", error };
  }
  return { kind: "unknown" };
}

// HTTP status is a number, not a union, so the 5xx range stays an `if` in the
// default branch.
function apiErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: APIError
): ErrorEvent {
  const status = error.status;
  switch (status) {
    case 400:
    case 422:
      return buildErrorEvent({
        metadata,
        type: "invalid_request_error",
        message: `Invalid request to OpenAI: ${error.message}`,
        originalError: error,
      });
    case 401:
      return buildErrorEvent({
        metadata,
        type: "authentication_error",
        message: `Authentication failed for OpenAI: ${error.message}`,
        originalError: error,
      });
    case 403:
      return buildErrorEvent({
        metadata,
        type: "permission_error",
        message: `Permission denied for OpenAI: ${error.message}`,
        originalError: error,
      });
    case 404:
      return buildErrorEvent({
        metadata,
        type: "not_found_error",
        message: `Resource not found for OpenAI: ${error.message}`,
        originalError: error,
      });
    case 429:
      return buildErrorEvent({
        metadata,
        type: "rate_limit_error",
        message: `Rate limit exceeded for OpenAI/${metadata.modelId}: ${error.message}`,
        originalError: error,
      });
    default:
      if (status !== undefined && status >= 500 && status < 600) {
        return buildErrorEvent({
          metadata,
          type: "server_error",
          message: `Server error from OpenAI (${status}): ${error.message}`,
          originalError: error,
        });
      }
      return buildErrorEvent({
        metadata,
        type: "unknown_error",
        message: `Error from OpenAI (${status}): ${error.message}`,
        originalError: error,
      });
  }
}

// Maps any error thrown by the OpenAI SDK while streaming into a unified
// `ErrorEvent`, so everything leaving the endpoint is an event, not an exception.
export function streamErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: unknown
): ErrorEvent {
  const classified = classifyStreamError(error);
  switch (classified.kind) {
    case "connection":
      return buildErrorEvent({
        metadata,
        type: "network_error",
        message: `Network error connecting to OpenAI: ${classified.error.message}`,
        originalError: error,
      });
    case "api":
      return apiErrorToErrorEvent(metadata, classified.error);
    case "unknown":
      return buildErrorEvent({
        metadata,
        type: "unknown_error",
        message: `Unknown error from OpenAI`,
        originalError: error,
      });
    default:
      assertNever(classified);
  }
}

// -- Composite: a completed output item → unified events --

// Returns the events to emit for a finished output item; the caller decides
// which are aggregated into the success summary.
export function outputItemToEvents(
  item: ResponseOutputItem,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): ModelResponseEvent[] {
  switch (item.type) {
    case "message":
      return item.content.flatMap((part): ModelResponseEvent[] => {
        switch (part.type) {
          case "output_text":
            return [
              converters.accumulatedTextToTextEvent(
                metadata,
                part.text,
                item.id
              ),
            ];
          case "refusal":
            return [
              buildErrorEvent({
                metadata,
                type: "refusal_error",
                message: part.refusal,
              }),
            ];
          default:
            assertNeverAndIgnore(part);
            return [];
        }
      });
    case "reasoning": {
      const text = item.summary.map((summary) => summary.text).join("\n\n");
      // Skip empty reasoning items (no summary emitted, e.g. effort "none").
      return text
        ? [
            converters.accumulatedReasoningToReasoningEvent(
              metadata,
              text,
              item.id,
              item.encrypted_content ?? undefined
            ),
          ]
        : [];
    }
    case "function_call":
      return [
        converters.functionCallToToolCallEvent(
          metadata,
          item.call_id,
          item.name,
          item.arguments
        ),
      ];
    // Output item types we don't surface (server tools, image gen, etc.).
    // Listed explicitly so a new Responses output item type breaks the build.
    case "file_search_call":
    case "function_call_output":
    case "web_search_call":
    case "computer_call":
    case "computer_call_output":
    case "tool_search_call":
    case "tool_search_output":
    case "compaction":
    case "image_generation_call":
    case "code_interpreter_call":
    case "local_shell_call":
    case "local_shell_call_output":
    case "shell_call":
    case "shell_call_output":
    case "apply_patch_call":
    case "apply_patch_call_output":
    case "mcp_call":
    case "mcp_list_tools":
    case "mcp_approval_request":
    case "mcp_approval_response":
    case "custom_tool_call":
    case "custom_tool_call_output":
      return [];
    default:
      assertNeverAndIgnore(item);
      return [];
  }
}

// -- Entry point: drive the raw stream into unified events --

export async function* rawOutputToEvents(
  stream: AsyncGenerator<ResponseStreamEvent>,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): AsyncGenerator<ModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  let usage: ResponseUsage | null = null;

  while (true) {
    let result: IteratorResult<ResponseStreamEvent>;
    try {
      result = await stream.next();
    } catch (err) {
      // Everything leaving the endpoint is an event: map any SDK error to a
      // unified error event and terminate rather than throwing.
      yield converters.streamErrorToErrorEvent(metadata, err);
      return;
    }
    if (result.done) {
      break;
    }

    const event = result.value;
    let outputEvents: ModelResponseEvent[] = [];
    switch (event.type) {
      case "response.created":
        outputEvents = [
          converters.responseCreatedToResponseIdEvent(metadata, event),
        ];
        break;
      case "response.output_text.delta":
        outputEvents = [
          converters.textDeltaToTextDeltaEvent(metadata, event.delta),
        ];
        break;
      case "response.reasoning_summary_text.delta":
        outputEvents = [
          converters.reasoningSummaryDeltaToReasoningDeltaEvent(
            metadata,
            event.delta
          ),
        ];
        break;
      case "response.output_item.added":
        if (event.item.type === "function_call") {
          outputEvents = [
            converters.functionCallToToolCallStartedEvent(
              metadata,
              event.item.call_id,
              event.output_index,
              event.item.name
            ),
          ];
        }
        break;
      case "response.function_call_arguments.delta":
        outputEvents = [
          converters.argumentsDeltaToToolCallDeltaEvent(metadata),
        ];
        break;
      case "response.output_item.done":
        outputEvents = outputItemToEvents(event.item, metadata, converters);
        break;
      case "response.completed":
        usage = event.response.usage ?? null;
        break;
      case "response.failed":
        yield converters.streamErrorToErrorEvent(
          metadata,
          event.response.error
        );
        return;
      case "response.incomplete":
        yield buildErrorEvent({
          metadata,
          type: "stop_error",
          message:
            event.response.incomplete_details?.reason ??
            "The response was incomplete.",
        });
        return;
      case "error":
        yield buildErrorEvent({
          metadata,
          type: "stream_error",
          message: event.message,
          originalError: event,
        });
        return;
      // Other Responses stream signals (audio, web search, mcp, etc.) are not
      // surfaced. Listed explicitly so a new stream event type breaks the build.
      case "response.audio.delta":
      case "response.audio.done":
      case "response.audio.transcript.delta":
      case "response.audio.transcript.done":
      case "response.code_interpreter_call_code.delta":
      case "response.code_interpreter_call_code.done":
      case "response.code_interpreter_call.completed":
      case "response.code_interpreter_call.in_progress":
      case "response.code_interpreter_call.interpreting":
      case "response.content_part.added":
      case "response.content_part.done":
      case "response.file_search_call.completed":
      case "response.file_search_call.in_progress":
      case "response.file_search_call.searching":
      case "response.function_call_arguments.done":
      case "response.in_progress":
      case "response.reasoning_summary_part.added":
      case "response.reasoning_summary_part.done":
      case "response.reasoning_summary_text.done":
      case "response.reasoning_text.delta":
      case "response.reasoning_text.done":
      case "response.refusal.delta":
      case "response.refusal.done":
      case "response.output_text.done":
      case "response.web_search_call.completed":
      case "response.web_search_call.in_progress":
      case "response.web_search_call.searching":
      case "response.image_generation_call.completed":
      case "response.image_generation_call.generating":
      case "response.image_generation_call.in_progress":
      case "response.image_generation_call.partial_image":
      case "response.mcp_call_arguments.delta":
      case "response.mcp_call_arguments.done":
      case "response.mcp_call.completed":
      case "response.mcp_call.failed":
      case "response.mcp_call.in_progress":
      case "response.mcp_list_tools.completed":
      case "response.mcp_list_tools.failed":
      case "response.mcp_list_tools.in_progress":
      case "response.output_text.annotation.added":
      case "response.queued":
      case "response.custom_tool_call_input.delta":
      case "response.custom_tool_call_input.done":
        outputEvents = [];
        break;
      default:
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

  if (usage !== null) {
    yield converters.usageToTokenUsageEvent(metadata, usage);
  }

  yield { type: "success", content: { aggregated }, metadata };
}

// -- Non-streaming entry point: a complete batch response → events --

function isNonDeltaEvent(
  event: ModelResponseEvent
): event is NonDeltaResponseEvent {
  return (
    event.type !== "text_delta" &&
    event.type !== "reasoning_delta" &&
    event.type !== "tool_call_delta"
  );
}

// Turns a complete `Response` (as returned by the Batch API) into the unified
// event array, mirroring `rawOutputToEvents` minus the streaming-only delta
// events. Reuses `outputItemToEvents` so output-item semantics stay
// single-sourced.
export function responseToEvents(
  response: OpenAIResponse,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): NonDeltaResponseEvent[] {
  // Terminal failure states surface as a single error event.
  if (response.status === "failed") {
    return [converters.streamErrorToErrorEvent(metadata, response.error)];
  }
  if (response.status === "incomplete") {
    return [
      buildErrorEvent({
        metadata,
        type: "stop_error",
        message:
          response.incomplete_details?.reason ?? "The response was incomplete.",
      }),
    ];
  }

  const events: NonDeltaResponseEvent[] = [];
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];

  events.push({
    type: "response_id",
    content: { responseId: response.id },
    metadata,
  });

  for (const item of response.output) {
    for (const event of outputItemToEvents(item, metadata, converters)) {
      if (
        event.type === "text" ||
        event.type === "reasoning" ||
        event.type === "tool_call"
      ) {
        aggregated.push(event);
      }
      if (isNonDeltaEvent(event)) {
        events.push(event);
      }
    }
  }

  if (response.usage) {
    events.push(converters.usageToTokenUsageEvent(metadata, response.usage));
  }

  events.push({ type: "success", content: { aggregated }, metadata });

  return events;
}
