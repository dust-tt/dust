import type {
  MessageDeltaUsage,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { assertNever } from "@dust-tt/sparkle";

import type {
  LLMEvent,
  ReasoningDeltaEvent,
  ReasoningGeneratedEvent,
  TextDeltaEvent,
  TextGeneratedEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { safeParseJSON } from "@app/types";

type StreamState = {
  currentBlockIsToolCall: boolean;
  textAccumulator: string;
  reasoningAccumulator: string;
  toolAccumulator: {
    id: string;
    name: string;
    input: string;
  };
};

export async function* streamLLMEvents(
  messageStreamEvents: AsyncIterable<MessageStreamEvent>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  const state: StreamState = {
    currentBlockIsToolCall: false,
    textAccumulator: "",
    reasoningAccumulator: "",
    toolAccumulator: {
      id: "",
      name: "",
      input: "",
    },
  };

  for await (const messageStreamEvent of messageStreamEvents) {
    yield* handleMessageStreamEvent(messageStreamEvent, state, metadata);
  }

  yield* yieldFinalEvents(state, metadata);
}

function* handleMessageStreamEvent(
  messageStreamEvent: MessageStreamEvent,
  state: StreamState,
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  switch (messageStreamEvent.type) {
    case "message_start":
    case "message_stop":
      // Nothing to do for now
      break;

    /* Content is sent as follows:
     * content_block_start (gives the type of the content block and some metadata)
     * content_block_delta (streams content) (multiple times)
     * content_block_stop (makrs the end of the content block)
     */
    case "content_block_start":
      handleContentBlockStart(messageStreamEvent, state);
      break;
    case "content_block_delta":
      yield* handleContentBlockDelta(messageStreamEvent, state, metadata);
      break;
    case "content_block_stop":
      yield* handleContentBlockStop(state, metadata);
      break;
    case "message_delta":
      yield* handleMessageDelta(messageStreamEvent, metadata);
      break;
    default:
      assertNever(messageStreamEvent);
  }
}

function handleContentBlockStart(
  event: Extract<MessageStreamEvent, { type: "content_block_start" }>,
  state: StreamState
): void {
  if (event.content_block.type === "tool_use") {
    state.currentBlockIsToolCall = true;
    state.toolAccumulator = {
      id: event.content_block.id,
      name: event.content_block.name,
      input: "",
    };
  }
}

function* handleContentBlockDelta(
  event: Extract<MessageStreamEvent, { type: "content_block_delta" }>,
  state: StreamState,
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  switch (event.delta.type) {
    case "text_delta":
      state.textAccumulator += event.delta.text;
      yield textDelta(event.delta.text, metadata);
      break;
    case "thinking_delta":
      state.reasoningAccumulator += event.delta.thinking;
      yield reasoningDelta(event.delta.thinking, metadata);
      break;
    case "input_json_delta":
      state.toolAccumulator.input += event.delta.partial_json;
      break;
    case "citations_delta":
    case "signature_delta":
      // TODO(LLM-Router) Handle these delta types if needed
      break;
    default:
      assertNever(event.delta);
  }
}

function* handleContentBlockStop(
  state: StreamState,
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  if (state.currentBlockIsToolCall) {
    yield toolCall({ ...state.toolAccumulator, metadata });
  }
  state.currentBlockIsToolCall = false;
}

function* handleMessageDelta(
  event: Extract<MessageStreamEvent, { type: "message_delta" }>,
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  yield tokenUsage(event.usage, metadata);

  if (event.delta.stop_reason) {
    yield* handleStopReason(event.delta.stop_reason, metadata);
  }
}

function* handleStopReason(
  stopReason: string,
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
    case "tool_use":
    case "pause_turn":
      /* When the assistant pauses the conversation, the stop reason is simply due to a long run, there was no error
       * the model simply decided to take a break here. It should simply be prompted to continue what it was doing.
       */
      // Nothing to do for these stop reasons
      break;
    case "max_tokens":
    case "refusal":
      yield {
        type: "error",
        content: {
          message: `Stop reason: ${stopReason}`,
          code: 0,
        },
        metadata,
      };
      break;
  }
}

function* yieldFinalEvents(
  state: StreamState,
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  if (state.textAccumulator.length > 0) {
    yield textGenerated(state.textAccumulator, metadata);
  }
  if (state.reasoningAccumulator.length > 0) {
    yield reasoningGenerated(state.reasoningAccumulator, metadata);
  }
}

function textDelta(delta: string, metadata: LLMClientMetadata): TextDeltaEvent {
  return {
    type: "text_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function reasoningDelta(
  delta: string,
  metadata: LLMClientMetadata
): ReasoningDeltaEvent {
  return {
    type: "reasoning_delta",
    content: {
      delta,
    },
    metadata,
  };
}

function textGenerated(
  text: string,
  metadata: LLMClientMetadata
): TextGeneratedEvent {
  return {
    type: "text_generated",
    content: {
      text,
    },
    metadata,
  };
}

function reasoningGenerated(
  text: string,
  metadata: LLMClientMetadata
): ReasoningGeneratedEvent {
  return {
    type: "reasoning_generated",
    content: {
      text,
    },
    metadata,
  };
}

function tokenUsage(
  usage: MessageDeltaUsage,
  metadata: LLMClientMetadata
): TokenUsageEvent {
  return {
    type: "token_usage",
    content: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens,
      // TODO(LLM-Router) Need to split between cache read and hit
      cachedTokens:
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0),
      totalTokens: (usage.input_tokens ?? 0) + usage.output_tokens,
    },
    metadata,
  };
}

function toolCall({
  id,
  name,
  input,
  metadata,
}: {
  id: string;
  name: string;
  input: string;
  metadata: LLMClientMetadata;
}): ToolCallEvent {
  const args = safeParseJSON(input);
  if (args.isErr()) {
    throw new Error(`Failed to parse tool call arguments: ${args.error}`);
  }
  return {
    type: "tool_call",
    content: {
      id: id,
      name: name,
      arguments: JSON.stringify(args.value),
    },
    metadata,
  };
}
