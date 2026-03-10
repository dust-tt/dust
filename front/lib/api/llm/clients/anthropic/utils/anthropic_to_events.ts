import assert from "node:assert";
import type { APIPromise } from "@anthropic-ai/sdk";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";
import type { MessageBatchResult } from "@anthropic-ai/sdk/resources/messages/batches.mjs";
import type {
  Message,
  MessageCountTokensParams,
  MessageParam,
  MessageStreamEvent,
  MessageTokensCount,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { validateContentBlockIndex } from "@app/lib/api/llm/clients/anthropic/utils/predicates";
import type { StreamState } from "@app/lib/api/llm/clients/anthropic/utils/types";
import { SuccessAggregate } from "@app/lib/api/llm/types/aggregates";
import type {
  LLMEvent,
  LLMOutputItem,
  ReasoningDeltaEvent,
  ReasoningGeneratedEvent,
  TextDeltaEvent,
  TextGeneratedEvent,
  TokenUsage,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isRecord } from "@app/types/shared/utils/general";
import cloneDeep from "lodash/cloneDeep";

export async function* streamLLMEvents(
  messageStreamEvents: AsyncIterable<BetaRawMessageStreamEvent>,
  metadata: LLMClientMetadata,
  countTokensCallback?: (
    body: MessageCountTokensParams
  ) => APIPromise<MessageTokensCount>
): AsyncGenerator<LLMEvent> {
  const stateContainer = { state: null };
  // Aggregate output items to build a SuccessCompletionEvent at the end of a turn.
  const aggregate = new SuccessAggregate();
  // Accumulate token usage to return later
  const tokenUsageAccumulator: Required<TokenUsage> = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    uncachedInputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
  };

  // There is an issue in Anthropic SDK showcasing that stream events get mutated after they are yielded.
  // https://github.com/anthropics/anthropic-sdk-typescript/issues/777
  // They say it has been fixed in the version we are using but in practice we still see it happening.
  // To work around this, we clone each event before processing it.
  for await (const mutableMessageStreamEvent of messageStreamEvents) {
    const messageStreamEvent = cloneDeep(mutableMessageStreamEvent);

    for (const ev of handleMessageStreamEvent(
      messageStreamEvent,
      stateContainer,
      metadata,
      tokenUsageAccumulator
    )) {
      aggregate.add(ev);
      yield ev;
    }
  }

  await estimateReasoningTokens(
    tokenUsageAccumulator,
    aggregate.textGenerated,
    aggregate.toolCalls,
    countTokensCallback,
    metadata
  );

  yield tokenUsage(tokenUsageAccumulator, metadata);

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
  metadata: LLMClientMetadata,
  tokenUsageAccumulator: Required<TokenUsage>
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
      yield* handleMessageDelta(
        messageStreamEvent,
        metadata,
        tokenUsageAccumulator
      );
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
    case "compaction":
      // We don't use these Anthropic tools
      break;
    default:
      assertNever(blockType);
  }
}

function* handleContentBlockDelta(
  event: Extract<BetaRawMessageStreamEvent, { type: "content_block_delta" }>,
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
      yield { type: "tool_call_delta", metadata };
      break;
    case "signature_delta":
      if (stateContainer.state.accumulatorType === "reasoning") {
        const previousSignature = stateContainer.state.signature ?? "";
        stateContainer.state.signature =
          previousSignature + event.delta.signature;
      }
      break;
    case "citations_delta":
    case "compaction_delta":
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
  metadata: LLMClientMetadata,
  tokenUsageAccumulator: Required<TokenUsage>
): Generator<LLMEvent> {
  // Accumulate token usage instead of yielding it
  const cachedTokens = event.usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = event.usage.cache_creation_input_tokens ?? 0;
  const uncachedInputTokens = event.usage.input_tokens ?? 0;
  const inputTokens = uncachedInputTokens + cachedTokens + cacheCreationTokens;
  const outputTokens = event.usage.output_tokens;

  tokenUsageAccumulator.inputTokens = inputTokens;
  tokenUsageAccumulator.outputTokens = outputTokens;
  tokenUsageAccumulator.cachedTokens = cachedTokens;
  tokenUsageAccumulator.cacheCreationTokens = cacheCreationTokens;
  tokenUsageAccumulator.uncachedInputTokens = uncachedInputTokens;
  tokenUsageAccumulator.totalTokens = inputTokens + outputTokens;

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
          isRetryable: true,
        },
        metadata
      );
      break;

    case "refusal":
      yield new EventError(
        {
          type: "refusal_error",
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

/**
 * Estimates reasoning tokens by comparing total output tokens against a count
 * of non-reasoning output tokens (text + tool calls). Mutates tokenUsageAccumulator
 * in place.
 */
async function estimateReasoningTokens(
  tokenUsageAccumulator: Required<TokenUsage>,
  textGenerated: TextGeneratedEvent | undefined,
  toolCalls: ToolCallEvent[] | undefined,
  countTokensCallback:
    | ((body: MessageCountTokensParams) => APIPromise<MessageTokensCount>)
    | undefined,
  metadata: LLMClientMetadata
): Promise<void> {
  const outputTokensWithoutReasoning: MessageParam[] = [];

  if (textGenerated) {
    outputTokensWithoutReasoning.push({
      content: textGenerated.content.text,
      role: "user" as const,
    });
  }
  if (toolCalls) {
    for (const call of toolCalls) {
      outputTokensWithoutReasoning.push({
        content: `${call.content.name} ${JSON.stringify(call.content.arguments)}`,
        role: "user" as const,
      });
    }
  }

  try {
    // Anthropic does not send the output token count details.
    // This allows a rough estimation of the reasoning tokens.
    const tokenCount = (await countTokensCallback?.({
      model: metadata.modelId,
      messages: outputTokensWithoutReasoning,
    })) ?? {
      input_tokens: tokenUsageAccumulator.outputTokens,
    };
    const reasoningTokens = Math.max(
      0,
      tokenUsageAccumulator.outputTokens - tokenCount.input_tokens
    );
    tokenUsageAccumulator.reasoningTokens = reasoningTokens;
    tokenUsageAccumulator.outputTokens =
      tokenUsageAccumulator.outputTokens - reasoningTokens;
  } catch (err) {
    logger.error("Failed getting token details from Anthropic", {
      error: normalizeError(err),
      metadata,
    });
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
  tokenUsageAccumulator: Required<TokenUsage>,
  metadata: LLMClientMetadata
): TokenUsageEvent {
  return {
    type: "token_usage",
    content: tokenUsageAccumulator,
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

/**
 * Converts a single Anthropic batch result to a list of LLMEvents,
 * mirroring what streamLLMEvents would have produced for a streaming call.
 */
export async function batchResultToLLMEvents(
  result: MessageBatchResult,
  metadata: LLMClientMetadata,
  countTokensCallback?: (
    body: MessageCountTokensParams
  ) => APIPromise<MessageTokensCount>
): Promise<LLMEvent[]> {
  switch (result.type) {
    case "succeeded":
      return succeededMessageToEvents(
        result.message,
        metadata,
        countTokensCallback
      );
    case "errored":
      return [
        new EventError(
          {
            type: "server_error",
            message: result.error.error.message,
            isRetryable: false,
          },
          metadata
        ),
      ];
    case "canceled":
      return [
        new EventError(
          {
            type: "stream_error",
            message: "Batch request was canceled.",
            isRetryable: false,
          },
          metadata
        ),
      ];
    case "expired":
      return [
        new EventError(
          {
            type: "stream_error",
            message: "Batch request expired before processing completed.",
            isRetryable: true,
          },
          metadata
        ),
      ];
    default:
      assertNever(result);
  }
}

export async function succeededMessageToEvents(
  message: Message,
  metadata: LLMClientMetadata,
  countTokensCallback?: (
    body: MessageCountTokensParams
  ) => APIPromise<MessageTokensCount>
): Promise<LLMEvent[]> {
  const events: LLMEvent[] = [];

  events.push({
    type: "interaction_id",
    content: { modelInteractionId: message.id },
    metadata,
  });

  const textBlocks: string[] = [];
  const toolCalls: ToolCallEvent[] = [];
  let reasoningGeneratedEvent: ReasoningGeneratedEvent | undefined = undefined;

  for (const block of message.content) {
    switch (block.type) {
      case "text":
        textBlocks.push(block.text);
        events.push(textGenerated(block.text, metadata));
        break;
      case "thinking":
        reasoningGeneratedEvent = reasoningGenerated(
          block.thinking,
          metadata,
          block.signature
        );
        events.push(reasoningGeneratedEvent);
        break;
      case "tool_use": {
        const input =
          typeof block.input === "object" &&
          block.input !== null &&
          isRecord(block.input)
            ? block.input
            : {};
        const toolCallEvent: ToolCallEvent = {
          type: "tool_call",
          content: { id: block.id, name: block.name, arguments: input },
          metadata,
        };
        toolCalls.push(toolCallEvent);
        events.push(toolCallEvent);
        break;
      }
      default:
        // Ignore other block types (redacted_thinking, server_tool_use, etc.)
        break;
    }
  }

  const usage = message.usage;
  const cachedTokens = usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const uncachedInputTokens = usage.input_tokens;
  const inputTokens = uncachedInputTokens + cachedTokens + cacheCreationTokens;
  const tokenUsageAccumulator = {
    inputTokens,
    outputTokens: usage.output_tokens,
    cachedTokens,
    cacheCreationTokens,
    uncachedInputTokens,
    totalTokens: inputTokens + usage.output_tokens,
    reasoningTokens: 0,
  };

  const textGeneratedEvent: TextGeneratedEvent | undefined =
    textBlocks.length > 0
      ? textGenerated(textBlocks.join(""), metadata)
      : undefined;

  await estimateReasoningTokens(
    tokenUsageAccumulator,
    textGeneratedEvent,
    toolCalls.length > 0 ? toolCalls : undefined,
    countTokensCallback,
    metadata
  );

  events.push(tokenUsage(tokenUsageAccumulator, metadata));

  const aggregated: LLMOutputItem[] = [];

  if (textGeneratedEvent) {
    aggregated.push(textGeneratedEvent);
  }
  if (reasoningGeneratedEvent) {
    aggregated.push(reasoningGeneratedEvent);
  }
  aggregated.push(...toolCalls);

  events.push({
    type: "success",
    aggregated,
    textGenerated: textGeneratedEvent,
    reasoningGenerated: reasoningGeneratedEvent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    metadata,
  });

  return events;
}
