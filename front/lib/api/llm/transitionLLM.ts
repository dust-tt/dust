import { LLM } from "@app/lib/api/llm/llm";
import type {
  BatchDeletionOutcome,
  BatchResult,
} from "@app/lib/api/llm/types/batch";
import { isBatchNotFoundError } from "@app/lib/api/llm/types/batch";
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
  LLMStreamMetadata,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import {
  extractEncryptedContentFromMetadata,
  parseReasoningMetadata,
  parseResponseFormatSchema,
} from "@app/lib/api/llm/utils";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import type {
  BatchEndpoint,
  BatchRequest,
  BatchStatus,
} from "@app/lib/model_constructors/batch/endpoint";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { NoopRequest } from "@app/lib/model_constructors/stream/endpoints/noop_noop_global_noop";
import { NoopNoopGlobalNoopStream } from "@app/lib/model_constructors/stream/endpoints/noop_noop_global_noop";
import {
  AGENT_PLATFORM_HOST,
  OPENAI_RESPONSES_HOST,
} from "@app/lib/model_constructors/types/hosts";
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
import { GOOGLE_LAB, NOOP_LAB } from "@app/lib/model_constructors/types/labs";
import { NOOP_MODEL } from "@app/lib/model_constructors/types/models";
import type {
  ErrorType,
  ModelResponseEvent,
  ReasoningEvent as NewReasoningEvent,
  TextEvent as NewTextEvent,
  ToolCallEvent as NewToolCallEvent,
  NonDeltaResponseEvent,
  PassthroughLab,
} from "@app/lib/model_constructors/types/output/events";
import { isCacheMissReason } from "@app/lib/model_constructors/utils/cache_miss_reason";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type {
  AgentFunctionCallContentType,
  AgentProviderPassthroughContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import { isAgentMessagePhase } from "@app/types/assistant/agent_message_content";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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

// The persisted passthrough `provider` uses the legacy provider-id vocabulary
// (e.g. `google_ai_studio`), while BaseMessage carries the model's `Lab`. Only
// `google_ai_studio` diverges (-> `google`); the rest are identical.
function passthroughProviderToLab(
  provider: AgentProviderPassthroughContentType["value"]["provider"]
): PassthroughLab {
  switch (provider) {
    case "google_ai_studio":
      return GOOGLE_LAB;
    case "openai":
    case "anthropic":
    case "mistral":
    case "deepseek":
    case "noop":
      return provider;
    default:
      assertNever(provider);
  }
}

// Inverse of `passthroughProviderToLab`: maps a new-router `PassthroughLab` back
// to the legacy provider-id vocabulary persisted on the passthrough content.
function labToPassthroughProvider(
  lab: PassthroughLab
): AgentProviderPassthroughContentType["value"]["provider"] {
  switch (lab) {
    case "google":
      return "google_ai_studio";
    case "openai":
    case "anthropic":
    case "mistral":
    case "deepseek":
    case "noop":
      return lab;
    default:
      assertNever(lab);
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
                  phase: c.metadata?.phase,
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
                    provider: passthroughProviderToLab(c.value.provider),
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

// Places provider user-message cache breakpoints at the same boundaries as the
// legacy Anthropic router. Returns a new array; does not mutate its input.
//   - Equipped-skills prefix: always. When the first message is the
//     `name: "system"` user block (the stable per agent+workspace skills list),
//     its last content block is cached for cross-conversation reuse. Mirrors the
//     legacy `isFirst && message.name === "system"` breakpoint. `toBaseMessages`
//     emits one BaseMessage per user content item, so messages[0]'s last block
//     sits at index (content.length - 1).
//   - Conversation tail: only when `explicitTailBreakpoint` is set — i.e. on
//     surfaces without the request-level automatic cache_control (Vertex/
//     agent-platform). The last user message is cached, mirroring legacy's
//     Vertex-only `isLast` marker. On the Anthropic API (and batch) the tail is
//     left to the top-level automatic cache, keeping within the 4-slot budget.
export function withMessageCacheBreakpoints(
  baseMessages: BaseMessage[],
  firstMessage: ModelMessageTypeMultiActionsWithoutContentFragment | undefined,
  { explicitTailBreakpoint }: { explicitTailBreakpoint: boolean }
): BaseMessage[] {
  const result = [...baseMessages];

  if (firstMessage?.role === "user" && firstMessage.name === "system") {
    const skillsBlockIndex = firstMessage.content.length - 1;
    const skillsBlock = result[skillsBlockIndex];
    if (skillsBlock?.role === "user") {
      result[skillsBlockIndex] = { ...skillsBlock, cache: "short" };
    }
  }

  if (explicitTailBreakpoint) {
    for (let i = result.length - 1; i >= 0; i--) {
      const msg = result[i];
      if (msg.role === "user") {
        result[i] = { ...msg, cache: "short" };
        break;
      }
    }
  }

  return result;
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
    case "response_id": {
      const cacheMissReason = event.metadata.content?.cacheMissReason;
      return {
        type: "interaction_id",
        content: {
          modelInteractionId: event.content.responseId,
          cacheMissReason: isCacheMissReason(cacheMissReason)
            ? cacheMissReason
            : undefined,
        },
        metadata,
      };
    }

    case "text_delta":
      return {
        type: "text_delta",
        content: { delta: event.content.value },
        metadata,
      };

    case "text": {
      // Carry the Responses API phase (commentary/final_answer) back onto the
      // legacy text event so it is persisted and resent on follow-up turns.
      const phase = event.metadata.content?.phase;
      return {
        type: "text_generated",
        content: { text: event.content.value },
        metadata: {
          ...metadata,
          ...(isString(phase) && isAgentMessagePhase(phase) ? { phase } : {}),
        },
      };
    }

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
        content: {
          provider: labToPassthroughProvider(event.content.provider),
          block: event.content.block,
        },
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

// The endpoint's `lab` is the model's developer ("deepseek" for a
// fireworks-hosted DeepSeek model), not the legacy `ModelProviderIdType` the LLM
// base keys its config on — that's the serving provider ("fireworks"). Resolve
// it from the model config, which is unique by modelId.
function legacyProviderIdForModel(modelId: ModelIdType): ModelProviderIdType {
  const modelConfig = getModelConfigByModelId(modelId);
  if (!modelConfig) {
    throw new Error(`Model config not found for ${modelId}`);
  }
  return modelConfig.providerId;
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
  //
  // `explicitTailBreakpoint` mirrors legacy's Vertex-only `isLast` marker: set it
  // for surfaces that lack the request-level automatic `cache_control`
  // (agent-platform/Vertex), so the conversation tail still gets a breakpoint.
  // On the Anthropic API (and batch) it stays false — the tail is covered by the
  // top-level automatic cache there, and adding one here would exceed the 4-slot
  // breakpoint budget.
  protected buildPayload(
    streamParameters: LLMStreamParameters,
    {
      explicitTailBreakpoint = false,
    }: { explicitTailBreakpoint?: boolean } = {}
  ): Payload {
    const { conversation, prompt } = streamParameters;

    const baseMessages = withMessageCacheBreakpoints(
      conversation.messages.flatMap(toBaseMessages),
      conversation.messages[0],
      { explicitTailBreakpoint }
    );

    const { instructions, sharedContext, ephemeralContext } =
      normalizePrompt(prompt);

    const system: SystemTextMessage[] = [];

    const instructionsText = instructions.map((s) => s.content).join("\n");
    if (instructionsText) {
      // The instructions tier only carries content that is stable per agent
      // version and workspace settings (the tool directives and server listing,
      // which vary with conversation state, live in the shared-context tier),
      // so it always takes the long TTL.
      system.push({
        role: "system",
        type: "text",
        content: { value: instructionsText },
        cache: "long",
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
    configSchema: BaseEndpointConfiguration["configSchema"],
    // Per-endpoint adjustment applied before schema validation (defaults to
    // identity). Some schemas reject provider-invalid combinations (e.g.
    // Anthropic requires temperature=1 with thinking), so the fix must land
    // before `parse`, not after.
    parseConfig: (config: InputConfig) => InputConfig = (config) => config,
    // Prompt cache key, forwarded only by surfaces whose config schema accepts
    // it (OpenAI Responses). Left undefined elsewhere so the provider schemas
    // that guard `cacheKey` to `undefined` still parse.
    cacheKey?: string
  ): InputConfig {
    const {
      specifications,
      forceToolCall,
      disableToolUse,
      toolSearchEnabled,
      previousMessageId,
    } = streamParameters;

    const config: InputConfig = {
      tools: specifications as ToolSpecification[],
      temperature: this.temperature ?? undefined,
      reasoning: {
        effort: mapReasoningEffort(
          this.reasoningEffort,
          this.modelConfig.useNativeLightReasoning ?? false
        ),
      },
      forceTool: forceToolCall,
      disableToolUse,
      toolSearchEnabled,
      outputFormat: parseResponseFormatSchema(
        this.responseFormat,
        this.metadata.clientId
      ),
      cacheKey,
    };

    return configSchema.parse({
      ...parseConfig(config),
      // Prompt-cache diagnostics opt-in. Kept only by the Anthropic (direct)
      // config schema; other surfaces' schemas strip this unknown key.
      previousMessageId,
    });
  }
}

/**
 * Streaming transition: wraps a new `StreamEndpoint` and delegates streaming and
 * event parsing to it. Returned by `getStreamLLM` for the streaming surface.
 */
export class StreamEndpointTransition extends BaseTransition {
  private model: StreamEndpoint;
  private endpointConstructor: DustStreamEndpointConstructor;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters,
    modelConstructor: DustStreamEndpointConstructor
  ) {
    super(auth, legacyProviderIdForModel(llmParameters.modelId), llmParameters);
    this.endpointConstructor = modelConstructor;
    this.model = new modelConstructor(llmParameters.credentials);

    const { host: api, region } = this.model.metadata();
    this.metadata = {
      ...this.metadata,
      inferenceProvider: api,
      region,
    };
  }

  protected buildStreamRequestPayload(
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ) {
    const { host: api } = this.model.metadata();
    // Agent-platform (Vertex) has no request-level automatic cache_control, so it
    // needs an explicit breakpoint on the conversation tail (legacy's isLast).
    const explicitTailBreakpoint = api === AGENT_PLATFORM_HOST;
    // Only OpenAI Responses consumes a prompt cache key (as `prompt_cache_key`);
    // legacy sent the conversationId. Other surfaces guard `cacheKey` to
    // undefined, so leave it unset for them.
    const cacheKey =
      api === OPENAI_RESPONSES_HOST ? metadata?.conversationId : undefined;
    return this.model.buildRequestPayload(
      this.buildPayload(streamParameters, { explicitTailBreakpoint }),
      this.buildConfig(
        streamParameters,
        this.model.constructor.configSchema,
        this.endpointConstructor.parseConfig,
        cacheKey
      )
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
 * Noop-specific streaming transition. The generic transition drops the two
 * things that make the noop model useful for testing, so we handle them here:
 *
 * - `staticResponse` (from `metaData`, used by the sidekick/dust global agents)
 *   is injected into the noop request; the payload alone cannot carry it.
 * - `consume $X` records a simulated run usage with an explicit cost, which the
 *   new router's token-based pricing cannot express. It surfaces through the
 *   base `getSimulatedRunUsages` hook.
 */
export class NoopStreamTransition extends StreamEndpointTransition {
  private readonly noopModel = new NoopNoopGlobalNoopStream(undefined);
  private readonly noopMetaData?: Record<string, unknown>;
  private simulatedRunUsages: RunUsageType[] | null = null;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters,
    modelConstructor: DustStreamEndpointConstructor
  ) {
    super(auth, llmParameters, modelConstructor);
    this.noopMetaData = llmParameters.metaData;
  }

  protected override buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ): NoopRequest {
    const request = this.noopModel.buildRequestPayload(
      this.buildPayload(streamParameters)
    );

    const staticResponse =
      typeof this.noopMetaData?.staticResponse === "string"
        ? this.noopMetaData.staticResponse
        : undefined;

    const command = request.lastUserMessageContent
      .replace(/<dust_system>[\s\S]*?<\/dust_system>/g, "")
      .trim();
    const consumeMatch = command.match(/consume \$(\d+(?:\.\d+)?)/i);
    if (consumeMatch) {
      const costMicroUsd = Math.round(parseFloat(consumeMatch[1]) * 1_000_000);
      this.simulatedRunUsages = [
        {
          providerId: NOOP_LAB,
          modelId: NOOP_MODEL,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: null,
          costMicroUsd,
          isBatch: false,
        },
      ];
    }

    return { ...request, staticResponse };
  }

  protected override getSimulatedRunUsages(): RunUsageType[] | null {
    // Consume once so a retried stream does not double-record the cost.
    const usages = this.simulatedRunUsages;
    this.simulatedRunUsages = null;
    return usages;
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
    super(auth, legacyProviderIdForModel(llmParameters.modelId), llmParameters);
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

  override async deleteBatch(
    batchId: string
  ): Promise<Result<BatchDeletionOutcome, Error>> {
    try {
      const deleted = await this.model.deleteBatch(batchId);
      return new Ok(deleted ? "deleted" : "unsupported");
    } catch (err) {
      if (isBatchNotFoundError(err)) {
        return new Ok("do_not_exist");
      }
      return new Err(normalizeError(err));
    }
  }
}
