import type {
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageStartEvent,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ModelResponseEvent,
  ReasoningEvent,
  ResponseIdEvent,
  TextDeltaEvent,
  TextEvent,
  ToolCallEvent,
} from "@app/lib/model_constructors/types/output/events";

// Cursor for the content block being streamed; deltas accumulate here until
// `content_block_stop` flushes it as an event.
export type BlockState = {
  index: number;
  accumulator: string;
  type: "text";
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
  accumulatedTextToTextEvent(
    metadata: EndpointMetadata,
    text: string
  ): TextEvent;
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

export function accumulatedTextToTextEvent(
  metadata: EndpointMetadata,
  text: string
): TextEvent {
  return { type: "text", content: { value: text }, metadata };
}

// -- Composite state machine: depends on the leaf converters --

export function contentBlockStartToEvents(
  event: RawContentBlockStartEvent,
  state: { current: BlockState | null },
  _metadata: EndpointMetadata,
  _converters: OutputEventConverters
): ModelResponseEvent[] {
  const block = event.content_block;
  switch (block.type) {
    case "text":
      state.current = { index: event.index, accumulator: "", type: "text" };
      return [];
    default:
      // Other block types are wired in in subsequent commits.
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
    default:
      // Other delta types are wired in in subsequent commits.
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
    default:
      // Other block types are wired in in subsequent commits.
      return [];
  }
}

// -- Entry point: drive the raw stream into unified events --

export async function* rawOutputToEvents(
  stream: AsyncGenerator<RawMessageStreamEvent>,
  metadata: EndpointMetadata,
  converters: OutputEventConverters
): AsyncGenerator<ModelResponseEvent> {
  const aggregated: (TextEvent | ReasoningEvent | ToolCallEvent)[] = [];
  const blockState: { current: BlockState | null } = { current: null };

  while (true) {
    let result: IteratorResult<RawMessageStreamEvent>;
    try {
      result = await stream.next();
    } catch {
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
      default:
        // Other stream event types are wired in in subsequent commits.
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

  yield {
    type: "success",
    content: { aggregated },
    metadata,
  };
}
