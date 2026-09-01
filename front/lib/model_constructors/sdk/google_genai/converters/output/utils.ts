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
  ToolCallEvent,
  ToolCallStartedEvent,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import {
  buildHttpStatusErrorEvent,
  httpErrorMessage,
} from "@app/lib/model_constructors/utils/classify_http_status";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type {
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
  Part,
} from "@google/genai";
import { ApiError, FinishReason } from "@google/genai";

// The per-signal leaf converters. The composite below takes an object
// satisfying this interface (`this`), so overriding one leaf on an endpoint
// changes how the composite uses it.
export interface OutputEventConverters {
  responseIdToResponseIdEvent(
    metadata: EndpointMetadata,
    responseId: string
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
  functionCallToToolCallStartedEvent(
    metadata: EndpointMetadata,
    id: string,
    index: number,
    name: string
  ): ToolCallStartedEvent;
  functionCallToToolCallEvent(
    metadata: EndpointMetadata,
    id: string,
    name: string,
    args: Record<string, unknown>,
    thoughtSignature?: string
  ): ToolCallEvent;
  usageToTokenUsageEvent(
    metadata: EndpointMetadata,
    usage: GenerateContentResponseUsageMetadata | undefined
  ): TokenUsageEvent;
  finishReasonToErrorEvent(
    metadata: EndpointMetadata,
    finishReason: FinishReason
  ): ErrorEvent | null;
  streamErrorToErrorEvent(
    metadata: EndpointMetadata,
    error: unknown
  ): ErrorEvent;
}

// -- Leaf converters: one unified event per Gemini stream signal --

export function responseIdToResponseIdEvent(
  metadata: EndpointMetadata,
  responseId: string
): ResponseIdEvent {
  return { type: "response_id", content: { responseId }, metadata };
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

export function functionCallToToolCallStartedEvent(
  metadata: EndpointMetadata,
  id: string,
  index: number,
  name: string
): ToolCallStartedEvent {
  return { type: "tool_call_started", content: { id, index, name }, metadata };
}

export function functionCallToToolCallEvent(
  metadata: EndpointMetadata,
  id: string,
  name: string,
  args: Record<string, unknown>,
  thoughtSignature?: string
): ToolCallEvent {
  return {
    type: "tool_call",
    content: { id, name, arguments: args },
    // Gemini 3 requires the thought signature to be echoed back in subsequent
    // requests, so carry it on the tool call's metadata. The signature is
    // carried under the generic `signature` key (matching reasoning events and
    // other providers); the transition layer persists it as `thoughtSignature`.
    metadata: {
      ...metadata,
      ...(thoughtSignature ? { content: { signature: thoughtSignature } } : {}),
    },
  };
}

export function usageToTokenUsageEvent(
  metadata: EndpointMetadata,
  usage: GenerateContentResponseUsageMetadata | undefined
): TokenUsageEvent {
  const cacheHit = usage?.cachedContentTokenCount ?? 0;
  // Gemini's promptTokenCount includes cached and tool-use input tokens;
  // subtract the cached portion so it is not counted twice against pricing.
  const totalInput =
    (usage?.promptTokenCount ?? 0) + (usage?.toolUsePromptTokenCount ?? 0);
  const candidateTokens = usage?.candidatesTokenCount ?? 0;
  const reasoning = usage?.thoughtsTokenCount;
  return {
    type: "token_usage",
    content: {
      // Gemini uses implicit caching with no explicit cache-creation tokens and
      // no per-TTL (short/long) breakdown.
      cacheCreated: 0,
      longCacheCreated: 0,
      shortCacheCreated: 0,
      cacheHit,
      standardInput: Math.max(0, totalInput - cacheHit),
      // Gemini reports candidate and thought tokens separately, while Dust's
      // totalOutput contract is the inclusive billed output total.
      totalOutput: candidateTokens + (reasoning ?? 0),
      ...(reasoning !== undefined ? { reasoning } : {}),
    },
    metadata,
  };
}

export function finishReasonToErrorEvent(
  metadata: EndpointMetadata,
  finishReason: FinishReason
): ErrorEvent | null {
  switch (finishReason) {
    case FinishReason.STOP:
      return null;
    case FinishReason.MAX_TOKENS:
      return buildErrorEvent({
        errorSource: "dust",
        metadata,
        type: "stop_error",
        message: "The maximum response length was reached.",
      });
    case FinishReason.SAFETY:
    case FinishReason.RECITATION:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.SPII:
    case FinishReason.IMAGE_PROHIBITED_CONTENT:
    case FinishReason.BLOCKLIST:
    case FinishReason.IMAGE_SAFETY:
    case FinishReason.LANGUAGE:
      return buildErrorEvent({
        errorSource: "dust",
        metadata,
        type: "refusal_error",
        message:
          "Google safety filters prevented this response. Try starting a new conversation or rephrasing your request.",
      });
    case FinishReason.MALFORMED_FUNCTION_CALL:
    case FinishReason.UNEXPECTED_TOOL_CALL:
      return buildErrorEvent({
        errorSource: "unknown",
        metadata,
        type: "model_output_error",
        message: `Model generated an invalid tool call for ${metadata.model}.`,
      });
    // Any other finish reason (OTHER, NO_IMAGE, unspecified, future values, ...)
    // is surfaced as an unknown error.
    default:
      return buildErrorEvent({
        errorSource: "provider",
        metadata,
        type: "unknown_error",
        message: `Unexpected finish reason from Google: ${finishReason}.`,
      });
  }
}

// Maps an HTTP status from a Google `ApiError` to a unified error event.
function apiErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: ApiError
): ErrorEvent {
  const status = error.status;
  const isAuthMessage = error.message
    .toLowerCase()
    .includes("api key not valid");

  if (status === 401 || (status === 400 && isAuthMessage)) {
    return buildErrorEvent({
      errorSource: "dust",
      metadata,
      type: "authentication_error",
      message: httpErrorMessage({
        type: "authentication_error",
        provider: "Google",
        detail: error.message,
      }),
      originalError: error,
    });
  }

  return buildHttpStatusErrorEvent({
    metadata,
    status: error.status,
    provider: "Google",
    detail: error.message,
    originalError: error,
  });
}

// Maps any error thrown by the Google SDK while streaming into a unified
// `ErrorEvent`, so everything leaving the endpoint is an event, not an exception.
export function streamErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: unknown
): ErrorEvent {
  if (error instanceof ApiError) {
    return apiErrorToErrorEvent(metadata, error);
  }
  return buildErrorEvent({
    errorSource: "provider",
    metadata,
    type: "unknown_error",
    message: `Unknown error from Google: ${normalizeError(error).message}`,
    originalError: error,
  });
}

// -- Accumulator across the stream: text/reasoning are concatenated until a
// tool call or the final finish reason flushes them as a single event. --

type Accumulator = {
  textParts: string;
  reasoningParts: string;
  thoughtSignature?: string;
  toolCallIndex: number;
};

// Flushes any pending reasoning then text as accumulated events, appending them
// to `aggregated`. Reasoning is flushed before text so the final text block
// stays last (checkers assert on the last aggregated event).
function flushAccumulated(
  acc: Accumulator,
  metadata: EndpointMetadata,
  converters: OutputEventConverters,
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[]
): ModelResponseEvent[] {
  const events: ModelResponseEvent[] = [];
  if (acc.reasoningParts) {
    // Carry the turn's thought signature on the reasoning block so it is
    // persisted with it and echoed back on replay. Gemini emits the signature
    // on the thinking (or a trailing) part ahead of the function call, so it is
    // captured in `acc.thoughtSignature` by the time we flush. Dropping it here
    // makes Gemini reject the replayed turn as a corrupted thought signature.
    const event = converters.accumulatedReasoningToReasoningEvent(
      metadata,
      acc.reasoningParts,
      acc.thoughtSignature
    );
    aggregated.push(event);
    events.push(event);
    acc.reasoningParts = "";
  }
  if (acc.textParts) {
    const event = converters.accumulatedTextToTextEvent(
      metadata,
      acc.textParts.trim()
    );
    aggregated.push(event);
    events.push(event);
    acc.textParts = "";
  }
  return events;
}

// Converts a single content part into the events to emit, mutating the
// accumulator for text/reasoning deltas. Function calls flush pending
// text/reasoning first, then emit the tool-call events.
function partToEvents(
  part: Part,
  acc: Accumulator,
  metadata: EndpointMetadata,
  converters: OutputEventConverters,
  aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[]
): ModelResponseEvent[] {
  if (part.functionCall) {
    const events = flushAccumulated(acc, metadata, converters, aggregated);
    const { id, name, args } = part.functionCall;
    // Google may omit the id; the consumer requires one to correlate the result.
    const callId = id ?? `fc_${acc.toolCallIndex}`;
    if (!name) {
      return events;
    }
    events.push(
      converters.functionCallToToolCallStartedEvent(
        metadata,
        callId,
        acc.toolCallIndex,
        name
      )
    );
    const toolCallEvent = converters.functionCallToToolCallEvent(
      metadata,
      callId,
      name,
      args ?? {},
      part.thoughtSignature
    );
    aggregated.push(toolCallEvent);
    events.push(toolCallEvent);
    acc.toolCallIndex += 1;
    return events;
  }

  // Gemini 3 emits the turn's thought signature on a trailing part that often
  // carries no text (alongside the STOP finish reason), so capture it before
  // the empty-text early return below.
  if (part.thoughtSignature) {
    acc.thoughtSignature = part.thoughtSignature;
  }

  if (!part.text) {
    return [];
  }

  if (part.thought) {
    acc.reasoningParts += part.text;
    return [
      converters.reasoningDeltaToReasoningDeltaEvent(metadata, part.text),
    ];
  }

  acc.textParts += part.text;
  return [converters.textDeltaToTextDeltaEvent(metadata, part.text)];
}

// -- Entry point: drive the raw stream into unified events --

export async function* rawOutputToEvents(
  stream: AsyncGenerator<GenerateContentResponse>,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): AsyncGenerator<ModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const acc: Accumulator = {
    textParts: "",
    reasoningParts: "",
    toolCallIndex: 0,
  };
  let hasYieldedResponseId = false;
  let usage: GenerateContentResponseUsageMetadata | undefined;
  let stopReason: string | null = null;

  while (true) {
    let result: IteratorResult<GenerateContentResponse>;
    try {
      result = await stream.next();
    } catch (err) {
      yield converters.streamErrorToErrorEvent(metadata, err);
      return;
    }
    if (result.done) {
      break;
    }

    const response = result.value;
    usage = response.usageMetadata ?? usage;

    if (!hasYieldedResponseId && response.responseId) {
      yield converters.responseIdToResponseIdEvent(
        metadata,
        response.responseId
      );
      hasYieldedResponseId = true;
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
      continue;
    }

    for (const part of candidate.content?.parts ?? []) {
      for (const event of partToEvents(
        part,
        acc,
        metadata,
        converters,
        aggregated
      )) {
        yield event;
      }
    }

    if (candidate.finishReason) {
      stopReason = candidate.finishReason;
      const errorEvent = converters.finishReasonToErrorEvent(
        metadata,
        candidate.finishReason
      );
      if (errorEvent) {
        // Terminal failure: surface the error and stop without a success event.
        yield errorEvent;
        return;
      }
      // Successful finish: flush any pending text/reasoning before the success.
      for (const event of flushAccumulated(
        acc,
        metadata,
        converters,
        aggregated
      )) {
        yield event;
      }
    }
  }

  yield converters.usageToTokenUsageEvent(metadata, usage);
  // Gemini 3 returns a single turn-level thought signature (emitted on a
  // trailing part with the STOP finish reason). The final text has no message
  // slot to carry it and the turn may not include any reasoning, so carry it on
  // the success metadata to be echoed back on the next request.
  yield {
    type: "success",
    content: { aggregated, ...(stopReason ? { stopReason } : {}) },
    metadata: {
      ...metadata,
      ...(acc.thoughtSignature
        ? { content: { signature: acc.thoughtSignature } }
        : {}),
    },
  };
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

// Turns a single complete `GenerateContentResponse` (as returned by the batch
// API) into the unified event array, mirroring `rawOutputToEvents` minus the
// streaming-only delta events. Reuses `partToEvents`/`flushAccumulated` so part
// semantics (thought signatures, tool-call id fallback) stay single-sourced.
export function responseToEvents(
  response: GenerateContentResponse,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): NonDeltaResponseEvent[] {
  const events: NonDeltaResponseEvent[] = [];
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const acc: Accumulator = {
    textParts: "",
    reasoningParts: "",
    toolCallIndex: 0,
  };

  if (response.responseId) {
    events.push(
      converters.responseIdToResponseIdEvent(metadata, response.responseId)
    );
  }

  const candidate = response.candidates?.[0];

  for (const part of candidate?.content?.parts ?? []) {
    for (const event of partToEvents(
      part,
      acc,
      metadata,
      converters,
      aggregated
    )) {
      if (isNonDeltaEvent(event)) {
        events.push(event);
      }
    }
  }

  for (const event of flushAccumulated(acc, metadata, converters, aggregated)) {
    if (isNonDeltaEvent(event)) {
      events.push(event);
    }
  }

  if (candidate?.finishReason) {
    const errorEvent = converters.finishReasonToErrorEvent(
      metadata,
      candidate.finishReason
    );
    if (errorEvent) {
      events.push(errorEvent);
    }
  }

  events.push(
    converters.usageToTokenUsageEvent(metadata, response.usageMetadata)
  );

  events.push({
    type: "success",
    content: { aggregated },
    metadata: {
      ...metadata,
      ...(acc.thoughtSignature
        ? { content: { signature: acc.thoughtSignature } }
        : {}),
    },
  });

  return events;
}
