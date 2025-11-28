import assert from "node:assert";

import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";
import type {
  MessageDeltaUsage,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import cloneDeep from "lodash/cloneDeep";

import { validateContentBlockIndex } from "@app/lib/api/llm/clients/anthropic/utils/predicates";
import type { StreamState } from "@app/lib/api/llm/clients/anthropic/utils/types";
import { SuccessAggregate } from "@app/lib/api/llm/types/aggregates";
import type {
  LLMEvent,
  ReasoningDeltaEvent,
  ReasoningGeneratedEvent,
  TextDeltaEvent,
  TextGeneratedEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import { assertNever } from "@app/types";

export async function* streamLLMEvents(
  messageStreamEvents: AsyncIterable<BetaRawMessageStreamEvent>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  const stateContainer = { state: null };
  // Aggregate output items to build a SuccessCompletionEvent at the end of a turn.
  const aggregate = new SuccessAggregate();

  // There is an issue in Anthropic SDK showcasing that stream events get mutated after they are yielded.
  // https://github.com/anthropics/anthropic-sdk-typescript/issues/777
  // They say it has been fixed in the version we are using but in practice we still see it happening.
  // To work around this, we clone each event before processing it.
  for await (const mutableMessageStreamEvent of messageStreamEvents) {
    const messageStreamEvent = cloneDeep(mutableMessageStreamEvent);

    for (const ev of handleMessageStreamEvent(
      messageStreamEvent,
      stateContainer,
      metadata
    )) {
      aggregate.add(ev);
      yield ev;
    }
  }

  yield {
    type: "success",
    aggregated: aggregate.aggregated,
    textGenerated: aggregate.textGenerated,
    reasoningGenerated: aggregate.reasoningGenerated,
    toolCalls: aggregate.toolCalls,
    metadata,
  };
}

function* handleMessageStreamEvent(
  messageStreamEvent: BetaRawMessageStreamEvent,
  stateContainer: { state: StreamState },
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  switch (messageStreamEvent.type) {
    case "message_start":
      yield {
        type: "interaction_id",
        content: {
          modelInteractionId: messageStreamEvent.message.id,
        },
        metadata,
      };
      break;
    case "message_stop":
      // Nothing to do for now
      break;

    /* Content is sent as follows:
     * content_block_start (gives the type of the content block and some metadata)
     * content_block_delta (streams content) (multiple times)
     * content_block_stop (marks the end of the content block)
     */
    case "content_block_start":
      handleContentBlockStart(messageStreamEvent, stateContainer);
      break;
    case "content_block_delta":
      yield* handleContentBlockDelta(
        messageStreamEvent,
        stateContainer,
        metadata
      );
      break;
    case "content_block_stop":
      yield* handleContentBlockStop(
        messageStreamEvent,
        stateContainer,
        metadata
      );
      break;
    case "message_delta":
      yield* handleMessageDelta(messageStreamEvent, metadata);
      break;
    default:
      assertNever(messageStreamEvent);
  }
}

function handleContentBlockStart(
  event: Extract<BetaRawMessageStreamEvent, { type: "content_block_start" }>,
  stateContainer: { state: StreamState }
): void {
  assert(
    stateContainer.state === null,
    `A content block is already being processed, cannot start a new one at index ${event.index}`
  );
  const blockType = event.content_block.type;
  switch (blockType) {
    case "text":
    case "thinking":
      stateContainer.state = {
        currentBlockIndex: event.index,
        accumulator: "",
        accumulatorType: blockType === "text" ? "text" : "reasoning",
      };
      break;
    case "tool_use":
      stateContainer.state = {
        currentBlockIndex: event.index,
        accumulator: "",
        accumulatorType: "tool_use",
        toolInfo: {
          id: event.content_block.id,
          name: event.content_block.name,
        },
      };
      break;
    case "redacted_thinking":
      // "Redacted thinking" provides no actionable information, as everything is encrypted
      break;
    case "server_tool_use":
    case "web_search_tool_result":
    case "web_fetch_tool_result":
    case "code_execution_tool_result":
    case "bash_code_execution_tool_result":
    case "text_editor_code_execution_tool_result":
    case "tool_search_tool_result":
    case "mcp_tool_use":
    case "mcp_tool_result":
    case "container_upload":
      // We don't use these Anthropic tools
      break;
    default:
      assertNever(blockType);
  }
}

function* handleContentBlockDelta(
  event: Extract<MessageStreamEvent, { type: "content_block_delta" }>,
  stateContainer: { state: StreamState },
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  validateContentBlockIndex(stateContainer.state, event);
  switch (event.delta.type) {
    case "text_delta":
      stateContainer.state.accumulator += event.delta.text;
      yield textDelta(event.delta.text, metadata);
      break;
    case "thinking_delta":
      stateContainer.state.accumulator += event.delta.thinking;
      yield reasoningDelta(event.delta.thinking, metadata);
      break;
    case "input_json_delta":
      stateContainer.state.accumulator += event.delta.partial_json;
      break;
    case "signature_delta":
      if (stateContainer.state.accumulatorType === "reasoning") {
        const previousSignature = stateContainer.state.signature ?? "";
        stateContainer.state.signature =
          previousSignature + event.delta.signature;
      }
      break;
    case "citations_delta":
      // We don't use Anthropic citations, as we have our own citations implementation
      break;
    default:
      assertNever(event.delta);
  }
}

function* handleContentBlockStop(
  event: Extract<MessageStreamEvent, { type: "content_block_stop" }>,
  stateContainer: { state: StreamState },
  metadata: LLMClientMetadata
): Generator<LLMEvent> {
  validateContentBlockIndex(stateContainer.state, event);
  switch (stateContainer.state.accumulatorType) {
    case "text":
      yield textGenerated(stateContainer.state.accumulator, metadata);
      break;
    case "reasoning":
      yield reasoningGenerated(
        stateContainer.state.accumulator,
        metadata,
        stateContainer.state.signature ?? ""
      );
      break;
    case "tool_use":
      yield toolCall({
        ...stateContainer.state.toolInfo,
        input: stateContainer.state.accumulator,
        metadata,
      });
  }
  stateContainer.state = null;
}

function* handleMessageDelta(
  event: Extract<BetaRawMessageStreamEvent, { type: "message_delta" }>,
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
      yield new EventError(
        {
          type: "stop_error",
          message: `Stop reason: ${stopReason}`,
          isRetryable: false,
        },
        metadata
      );
      break;

    case "refusal":
      yield new EventError(
        {
          type: "stop_error",
          message:
            "Claude enhanced safety filters prevented this response. This can happen with " +
            "certain images, document IDs, or in longer conversations. Try starting a new " +
            "conversation or changing the agent's model to GPT-5.",
          isRetryable: false,
        },
        metadata
      );
      break;
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
  metadata: LLMClientMetadata,
  signature: string
): ReasoningGeneratedEvent {
  return {
    type: "reasoning_generated",
    content: {
      text,
    },
    metadata: { ...metadata, encrypted_content: signature },
  };
}

function tokenUsage(
  usage: MessageDeltaUsage,
  metadata: LLMClientMetadata
): TokenUsageEvent {
  const cachedTokens = usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  // Include all input tokens to keep consistency with core implementation
  const inputTokens =
    (usage.input_tokens ?? 0) + cachedTokens + cacheCreationTokens;

  return {
    type: "token_usage",
    content: {
      inputTokens,
      outputTokens: usage.output_tokens,
      cachedTokens,
      cacheCreationTokens,
      totalTokens: inputTokens + usage.output_tokens,
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
  return {
    type: "tool_call",
    content: {
      id: id,
      name: name,
      arguments: parseToolArguments(input, name),
    },
    metadata,
  };
}
