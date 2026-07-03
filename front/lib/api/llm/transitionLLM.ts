import { LLM } from "@app/lib/api/llm/llm";
import type { BatchResult } from "@app/lib/api/llm/types/batch";
import {
  handleGenericError,
  type LLMErrorType,
} from "@app/lib/api/llm/types/errors";
import type {
  LLMEvent,
  LLMOutputItem,
  ToolCallEvent as OldToolCallEvent,
  ReasoningGeneratedEvent,
  TextGeneratedEvent,
} from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import {
  extractEncryptedContentFromMetadata,
  parseReasoningMetadata,
  parseResponseFormatSchema,
} from "@app/lib/api/llm/utils";
import type { Authenticator } from "@app/lib/auth";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import type {
  BatchEndpoint,
  BatchRequest,
  BatchStatus,
} from "@app/lib/model_constructors/batch/endpoint";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type {
  InputConfig,
  ToolSpecification,
} from "@app/lib/model_constructors/types/input/configuration";
import type {
  BaseMessage,
  Payload,
  SystemTextMessage,
  ToolCallResultPart,
} from "@app/lib/model_constructors/types/input/messages";
import type {
  ErrorType,
  ModelResponseEvent,
  ReasoningEvent as NewReasoningEvent,
  TextEvent as NewTextEvent,
  ToolCallEvent as NewToolCallEvent,
  NonDeltaResponseEvent,
} from "@app/lib/model_constructors/types/output/events";
import type {
  AgentFunctionCallContentType,
  AgentProviderPassthroughContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";

/**
 * Maps a reasoning effort to the model constructor's effort values.
 */
function mapReasoningEffort(
  effort: ReasoningEffort | null,
  useNativeLightReasoning: boolean
): "none" | "low" | "medium" | "high" | "maximal" {
  switch (effort) {
    case null:
    case "none":
      return "none";
    case "light":
      // Models without native light reasoning rely on the chain-of-thought meta
      // prompt instead of native thinking. Enabling native thinking while that
      // meta prompt is injected makes the <thinking>/<response> tags leak, so
      // keep thinking disabled for them.
      return useNativeLightReasoning ? "low" : "none";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      assertNever(effort);
  }
}

/**
 * Converts an old-system message to new BaseMessage(s).
 */
export function toBaseMessages(
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): BaseMessage[] {
  switch (message.role) {
    case "user":
      return message.content.map((c): BaseMessage => {
        switch (c.type) {
          case "text":
            return { role: "user", type: "text", content: { value: c.text } };
          case "image_url":
            return {
              role: "user",
              type: "image_url",
              content: { url: c.image_url.url },
            };
          default:
            assertNever(c);
        }
      });
    case "function": {
      const parts: ToolCallResultPart[] =
        typeof message.content === "string"
          ? [{ type: "text", text: message.content }]
          : message.content.map((c) =>
              c.type === "text"
                ? { type: "text", text: c.text }
                : { type: "image_url", url: c.image_url.url }
            );
      return [
        {
          role: "user",
          type: "tool_call_result",
          content: {
            callId: message.function_call_id,
            toolName: message.name,
            parts,
            isError: false,
          },
        },
      ];
    }
    case "assistant":
      return message.contents.flatMap(
        (
          c:
            | AgentTextContentType
            | AgentReasoningContentType
            | AgentFunctionCallContentType
            | AgentProviderPassthroughContentType
        ): BaseMessage[] => {
          switch (c.type) {
            case "text_content":
              return [
                {
                  role: "assistant",
                  type: "text",
                  content: { value: c.value },
                },
              ];
            case "reasoning": {
              if (!c.value.reasoning) {
                return [];
              }
              // OpenAI Responses stores a short reasoning item `id` (kept in
              // `signature`) separately from the long `encrypted_content`. Every
              // other provider stores its thinking signature under
              // `encrypted_content`, which we carry directly in `signature`.
              if (c.value.provider !== "openai") {
                return [
                  {
                    role: "assistant",
                    type: "reasoning",
                    content: { value: c.value.reasoning },
                    signature: extractEncryptedContentFromMetadata(
                      c.value.metadata
                    ),
                  },
                ];
              }
              const { id, encryptedContent } = parseReasoningMetadata(
                c.value.metadata
              );
              return [
                {
                  role: "assistant",
                  type: "reasoning",
                  content: { value: c.value.reasoning },
                  signature: id,
                  encryptedContent,
                },
              ];
            }
            case "function_call":
              return [
                {
                  role: "assistant",
                  type: "tool_call_request",
                  content: {
                    callId: c.value.id,
                    toolName: c.value.name,
                    arguments: c.value.arguments,
                  },
                  signature: c.value.metadata?.thoughtSignature,
                },
              ];
            case "provider_passthrough":
              return [
                {
                  role: "assistant",
                  type: "provider_passthrough",
                  content: {
                    provider: c.value.provider,
                    block: c.value.block,
                  },
                },
              ];
            default:
              assertNever(c);
          }
        }
      );
    case "compaction":
      return [
        {
          role: "user",
          type: "text",
          content: { value: message.content },
        },
      ];
    default:
      assertNever(message);
  }
}

/**
 * Converts the rendered conversation to BaseMessages and places at most one
 * message-level cache breakpoint.
 *
 * Anthropic allows 4 cache_control markers per request. The direct Anthropic
 * client sends a request-level cache_control that the API materializes as a
 * marker on the last cacheable block and counts against that limit. With the two
 * system blocks placed in `buildPayload`, that leaves room for exactly one
 * message-level marker.
 *
 * It goes on the leading equipped-skills message when present (large, stable per
 * agent, reused across conversations and users) and on the last user-role message
 * otherwise, where it keeps the conversation prefix cached across turns on Vertex,
 * which has no request-level caching.
 */
export function toBaseMessagesWithCacheBreakpoints(
  messages: ModelMessageTypeMultiActionsWithoutContentFragment[]
): BaseMessage[] {
  // The skills message is the leading, system-authored user message. Its name
  // discriminator does not survive the conversion, hence the check on the source.
  const [first] = messages;
  const hasLeadingSkillsMessage =
    first !== undefined && first.role === "user" && first.name === "system";

  const baseMessages = messages.flatMap((message, index): BaseMessage[] => {
    const base = toBaseMessages(message);
    if (index === 0 && hasLeadingSkillsMessage) {
      return base.map((m, i) =>
        i === base.length - 1 ? { ...m, cache: "short" } : m
      );
    }
    return base;
  });

  if (!hasLeadingSkillsMessage) {
    for (let i = baseMessages.length - 1; i >= 0; i--) {
      const msg = baseMessages[i];
      if (msg.role === "user") {
        baseMessages[i] = { ...msg, cache: "short" };
        break;
      }
    }
  }

  return baseMessages;
}

// The new router nests reasoning replay state under `metadata.content`: OpenAI
// uses `id` + `encryptedContent`, Anthropic/Gemini use `signature`. Persist it in
// the legacy top-level shape (`id` / `encrypted_content`) the replay path reads,
// matching what the old router writes.
export function reasoningContentToLegacyMetadata(
  content: Record<string, unknown> | undefined
): { id?: string; encrypted_content?: string } {
  const id = isString(content?.id) ? content.id : undefined;
  const encryptedContent = content?.encryptedContent ?? content?.signature;
  return {
    ...(id ? { id } : {}),
    ...(isString(encryptedContent)
      ? { encrypted_content: encryptedContent }
      : {}),
  };
}

/**
 * Converts a new model aggregated item to the old LLMOutputItem format.
 */
function convertAggregatedItem(
  item: NewTextEvent | NewReasoningEvent | NewToolCallEvent,
  metadata: LLMClientMetadata
): LLMOutputItem {
  switch (item.type) {
    case "text":
      return {
        type: "text_generated",
        content: { text: item.content.value },
        metadata,
      };
    case "reasoning":
      return {
        type: "reasoning_generated",
        content: { text: item.content.value },
        metadata: {
          ...metadata,
          ...reasoningContentToLegacyMetadata(item.metadata.content),
        },
      };
    case "tool_call":
      return {
        type: "tool_call",
        content: {
          id: item.content.id,
          name: item.content.name,
          arguments: item.content.arguments,
        },
        metadata: {
          ...metadata,
          ...(typeof item.metadata.content?.signature === "string"
            ? { thoughtSignature: item.metadata.content.signature }
            : {}),
        },
      };
    default:
      assertNever(item);
  }
}

/**
 * Maps new model ErrorType to old LLMErrorType with correct retryability.
 */
function mapErrorType(errorType: ErrorType): {
  type: LLMErrorType;
  isRetryable: boolean;
} {
  switch (errorType) {
    case "input_configuration_error":
      return { type: "invalid_request_error", isRetryable: false };
    case "stop_error":
      return { type: "stop_error", isRetryable: true };
    case "refusal_error":
      return { type: "refusal_error", isRetryable: false };
    case "model_output_error":
      return { type: "invalid_request_error", isRetryable: true };
    case "rate_limit_error":
      return { type: "rate_limit_error", isRetryable: true };
    case "overloaded_error":
      return { type: "overloaded_error", isRetryable: true };
    case "invalid_request_error":
      return { type: "invalid_request_error", isRetryable: false };
    case "authentication_error":
      return { type: "authentication_error", isRetryable: false };
    case "permission_error":
      return { type: "permission_error", isRetryable: false };
    case "not_found_error":
      return { type: "not_found_error", isRetryable: false };
    case "network_error":
      return { type: "network_error", isRetryable: true };
    case "timeout_error":
      return { type: "timeout_error", isRetryable: true };
    case "server_error":
      return { type: "server_error", isRetryable: true };
    case "stream_error":
      return { type: "stream_error", isRetryable: true };
    case "unknown_error":
      return { type: "unknown_error", isRetryable: false };
    default:
      assertNever(errorType);
  }
}

/**
 * Converts a single new model event to its old LLM event equivalent.
 */
export function convertToOldEvent(
  event: ModelResponseEvent,
  metadata: LLMClientMetadata
): LLMEvent {
  switch (event.type) {
    case "response_id":
      return {
        type: "interaction_id",
        content: { modelInteractionId: event.content.responseId },
        metadata,
      };

    case "text_delta":
      return {
        type: "text_delta",
        content: { delta: event.content.value },
        metadata,
      };

    case "text":
      return {
        type: "text_generated",
        content: { text: event.content.value },
        metadata,
      };

    case "reasoning_delta":
      return {
        type: "reasoning_delta",
        content: { delta: event.content.value },
        metadata,
      };

    case "reasoning":
      return {
        type: "reasoning_generated",
        content: { text: event.content.value },
        metadata: {
          ...metadata,
          ...reasoningContentToLegacyMetadata(event.metadata.content),
        },
      };

    case "tool_call_started":
      return {
        type: "tool_call_started",
        content: event.content,
        metadata,
      };

    case "tool_call_delta":
      return {
        type: "tool_call_delta",
        metadata,
      };

    case "tool_call":
      return {
        type: "tool_call",
        content: {
          id: event.content.id,
          name: event.content.name,
          arguments: event.content.arguments,
        },
        metadata: {
          ...metadata,
          ...(typeof event.metadata.content?.signature === "string"
            ? { thoughtSignature: event.metadata.content.signature }
            : {}),
        },
      };

    case "token_usage": {
      const {
        standardInput,
        standardOutput,
        cacheHit,
        cacheCreated,
        longCacheCreated,
        shortCacheCreated,
        reasoning,
      } = event.content;
      // `cacheCreated` is only set when the provider reports a flat total with
      // no per-duration breakdown. Otherwise the split lives in long/short.
      const hasDurationBreakdown = cacheCreated === 0;
      const totalCacheCreated = hasDurationBreakdown
        ? longCacheCreated + shortCacheCreated
        : cacheCreated;
      const inputTokens = standardInput + cacheHit + totalCacheCreated;
      return {
        type: "token_usage",
        content: {
          inputTokens,
          outputTokens: standardOutput,
          reasoningTokens: reasoning,
          totalTokens: inputTokens + standardOutput + reasoning,
          cachedTokens: cacheHit,
          cacheCreationTokens: totalCacheCreated,
          ...(hasDurationBreakdown
            ? {
                longCacheCreationTokens: longCacheCreated,
                shortCacheCreationTokens: shortCacheCreated,
              }
            : {}),
          uncachedInputTokens: standardInput,
        },
        metadata,
      };
    }

    case "success": {
      const aggregated = event.content.aggregated.map((item) =>
        convertAggregatedItem(item, metadata)
      );
      const textGenerated = aggregated.find(
        (item): item is TextGeneratedEvent => item.type === "text_generated"
      );
      const reasoningGenerated = aggregated.find(
        (item): item is ReasoningGeneratedEvent =>
          item.type === "reasoning_generated"
      );
      const toolCalls = aggregated.filter(
        (item): item is OldToolCallEvent => item.type === "tool_call"
      );
      return {
        type: "success",
        aggregated,
        textGenerated,
        reasoningGenerated,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        metadata,
      };
    }

    case "provider_passthrough":
      return {
        type: "provider_passthrough",
        content: event.content,
        metadata,
      };

    case "error": {
      const { type: errorType, isRetryable } = mapErrorType(event.content.type);
      return new EventError(
        {
          type: errorType,
          message: event.content.message,
          isRetryable,
          originalError: event.content.originalError,
        },
        metadata
      );
    }

    default:
      assertNever(event);
  }
}

/**
 * Converts a stream of new model events to old LLM events.
 */
async function* convertToOldEvents(
  newEvents: AsyncGenerator<ModelResponseEvent>,
  metadata: LLMClientMetadata
): AsyncGenerator<LLMEvent> {
  for await (const event of newEvents) {
    yield convertToOldEvent(event, metadata);
  }
}

/**
 * Converts a completed batch entry's events (no streaming deltas) to old LLM
 * events. Shares the per-event mapping with the streaming path.
 */
function convertBatchEventsToOld(
  events: NonDeltaResponseEvent[],
  metadata: LLMClientMetadata
): LLMEvent[] {
  return events.map((event) => convertToOldEvent(event, metadata));
}

/**
 * Shared base bridging the old LLM system with the new model_constructors one.
 *
 * It extends the old LLM base class (used by the existing agent pipeline) and
 * owns the surface-agnostic conversion: old message types -> `BaseMessage`,
 * LLM parameters -> the new `InputConfig`. The concrete subclasses bind a single
 * inference surface — `StreamEndpointTransition` for streaming,
 * `BatchEndpointTransition` for batch — mirroring `StreamEndpoint`/`BatchEndpoint`.
 */
abstract class BaseTransition extends LLM {
  // Builds the provider-agnostic conversation payload (system + messages) shared
  // by both the streaming and batch surfaces.
  protected buildPayload(streamParameters: LLMStreamParameters): Payload {
    const { conversation, hasConditionalJITTools, prompt } = streamParameters;

    const baseMessages = toBaseMessagesWithCacheBreakpoints(
      conversation.messages
    );

    const { instructions, sharedContext, ephemeralContext } =
      normalizePrompt(prompt);

    const system: SystemTextMessage[] = [];

    const instructionsText = instructions.map((s) => s.content).join("\n");
    if (instructionsText) {
      system.push({
        role: "system",
        type: "text",
        content: { value: instructionsText },
        cache: hasConditionalJITTools ? "short" : "long",
      });
    }

    const sharedText = sharedContext.map((s) => s.content).join("\n");
    if (sharedText) {
      system.push({
        role: "system",
        type: "text",
        content: { value: sharedText },
        cache: "short",
      });
    }

    const ephemeralText = ephemeralContext.map((s) => s.content).join("\n");
    if (ephemeralText) {
      system.push({
        role: "system",
        type: "text",
        content: { value: ephemeralText },
      });
    }

    return { conversation: { system, messages: baseMessages } };
  }

  // Builds the request config from the LLM parameters, parsed by the surface's
  // own `configSchema` (stream and batch own theirs independently).
  protected buildConfig(
    streamParameters: LLMStreamParameters,
    configSchema: BaseEndpointConfiguration["configSchema"]
  ): InputConfig {
    const { specifications, forceToolCall, toolSearchEnabled } =
      streamParameters;

    return configSchema.parse({
      tools: specifications as ToolSpecification[],
      temperature: this.temperature ?? undefined,
      reasoning: {
        effort: mapReasoningEffort(
          this.reasoningEffort,
          this.modelConfig.useNativeLightReasoning ?? false
        ),
      },
      forceTool: forceToolCall,
      toolSearchEnabled,
      outputFormat: parseResponseFormatSchema(
        this.responseFormat,
        this.metadata.clientId
      ),
    });
  }
}

/**
 * Streaming transition: wraps a new `StreamEndpoint` and delegates streaming and
 * event parsing to it. Returned by `getStreamLLM` for the streaming surface.
 */
export class StreamEndpointTransition extends BaseTransition {
  private model: StreamEndpoint;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters,
    modelConstructor: StreamEndpointConstructor
  ) {
    super(auth, modelConstructor.providerId, llmParameters);
    this.model = new modelConstructor(llmParameters.credentials);

    const { api, region } = this.model.metadata();
    this.metadata = {
      ...this.metadata,
      inferenceProvider: api,
      region,
    };
  }

  protected buildStreamRequestPayload(streamParameters: LLMStreamParameters) {
    return this.model.buildRequestPayload(
      this.buildPayload(streamParameters),
      this.buildConfig(streamParameters, this.model.constructor.configSchema)
    );
  }

  protected async *sendRequest(payload: unknown): AsyncGenerator<LLMEvent> {
    try {
      const rawStream = this.model.streamRaw(payload);
      const newEvents = this.model.rawStreamOutputToEvents(rawStream);
      yield* convertToOldEvents(newEvents, this.metadata);
    } catch (err) {
      yield handleGenericError(err, this.metadata);
    }
  }
}

/**
 * Batch transition: wraps a new `BatchEndpoint` and delegates batch submission,
 * polling, and result conversion to it. Returned by `getBatchLLM`.
 */
export class BatchEndpointTransition extends BaseTransition {
  private model: BatchEndpoint;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters,
    modelConstructor: BatchEndpointConstructor
  ) {
    super(auth, modelConstructor.providerId, llmParameters);
    this.model = new modelConstructor(llmParameters.credentials);
  }

  // Builds the per-request payload for tracing (the base class captures batch
  // inputs via this hook). Streaming itself is never invoked on a batch LLM.
  protected buildStreamRequestPayload(streamParameters: LLMStreamParameters) {
    return this.model.buildRequestPayload(
      this.buildPayload(streamParameters),
      this.buildConfig(streamParameters, this.model.constructor.configSchema)
    );
  }

  protected async *sendRequest(): AsyncGenerator<LLMEvent> {
    throw new Error(
      "Streaming is not supported on a batch transition LLM; use getStreamLLM instead."
    );
  }

  protected override async internalSendBatchProcessing(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    const requests = new Map<string, BatchRequest>();
    for (const [customId, streamParameters] of conversations) {
      requests.set(customId, {
        payload: this.buildPayload(streamParameters),
        config: this.buildConfig(
          streamParameters,
          this.model.constructor.configSchema
        ),
      });
    }

    return this.model.sendBatch(requests);
  }

  override async getBatchStatus(batchId: string): Promise<BatchStatus> {
    return this.model.getBatchStatus(batchId);
  }

  protected override async internalGetBatchResult(
    batchId: string
  ): Promise<BatchResult> {
    const results = await this.model.getBatchResult(batchId);

    const batchResult: BatchResult = new Map();
    for (const [customId, events] of results) {
      batchResult.set(customId, convertBatchEventsToOld(events, this.metadata));
    }
    return batchResult;
  }

  override async deleteBatch(batchId: string): Promise<boolean> {
    return this.model.deleteBatch(batchId);
  }
}
