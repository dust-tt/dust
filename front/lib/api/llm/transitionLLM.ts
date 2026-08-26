import type { InferenceRegionType } from "@app/lib/api/assistant/token_pricing";
import { LLM } from "@app/lib/api/llm/llm";
import { withConciseOpenAIReasoningSummary } from "@app/lib/api/llm/reasoning_summary";
import type {
  BatchDeletionOutcome,
  BatchResult,
} from "@app/lib/api/llm/types/batch";
import { isBatchNotFoundError } from "@app/lib/api/llm/types/batch";
import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
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
import { getPromptCacheKey } from "@app/lib/api/llm/utils/prompt_cache_key";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
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
import type { Host } from "@app/lib/model_constructors/types/hosts";
import {
  AGENT_PLATFORM_HOST,
  OPENAI_RESPONSES_HOST,
  XAI_HOST,
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
import type { Lab } from "@app/lib/model_constructors/types/labs";
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
import type { Region } from "@app/lib/model_constructors/types/regions";
import { EUROPE, GLOBAL, US } from "@app/lib/model_constructors/types/regions";
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
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getMinimumReasoningEffort } from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";

export function inferenceRegionForEndpointRegion(
  region: Region
): InferenceRegionType {
  switch (region) {
    case EUROPE:
      return "eu";
    case GLOBAL:
    case US:
      return "global";
    default:
      return assertNever(region);
  }
}

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
              const reasoning = c.value.reasoning ?? "";
              const { id, encryptedContent } = parseReasoningMetadata(
                c.value.metadata
              );
              // Empty reasoning summaries can still carry replay state. Some
              // reasoners emit such items on tool-use turns, so only discard
              // an empty block when it has neither an item id nor encrypted
              // content.
              if (!reasoning && !id && !encryptedContent) {
                return [];
              }
              // Responses APIs store a short reasoning item `id` (kept in
              // `signature`) separately from the long `encrypted_content`.
              // Detect that wire format from the persisted id rather than the
              // model provider: Fireworks also exposes the Responses API.
              if (id || c.value.provider === "openai") {
                return [
                  {
                    role: "assistant",
                    type: "reasoning",
                    content: { value: reasoning },
                    signature: id,
                    ...(encryptedContent ? { encryptedContent } : {}),
                  },
                ];
              }
              return [
                {
                  role: "assistant",
                  type: "reasoning",
                  content: { value: reasoning },
                  signature: extractEncryptedContentFromMetadata(
                    c.value.metadata
                  ),
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
                    namespace: c.value.namespace,
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
//   - Shared equipped-skills prefix: always. When the first message is the
//     `name: "system"` user block (the stable per agent+workspace skills list),
//     its last content block is cached for cross-conversation reuse. Mirrors the
//     legacy `isFirst && message.name === "system"` breakpoint. `toBaseMessages`
//     emits one BaseMessage per user content item, so messages[0]'s last block
//     sits at index (content.length - 1). A following user-specific favorites
//     message uses `name: "user"` and is intentionally left unmarked.
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

// The new router nests reasoning replay state under `metadata.content`:
// Responses APIs use `id` + `encryptedContent`, while other APIs use
// `signature`. Persist it in the legacy top-level shape (`id` /
// `encrypted_content`) the replay path reads, matching what the old router
// writes.
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
        content: item.content,
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
        content: event.content,
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
        totalOutput,
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
      if (
        reasoning !== undefined &&
        (reasoning < 0 || reasoning > totalOutput)
      ) {
        throw new Error(
          "reasoning must be a non-negative subset of totalOutput"
        );
      }
      return {
        type: "token_usage",
        content: {
          inputTokens,
          totalOutputTokens: totalOutput,
          ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
          totalTokens: inputTokens + totalOutput,
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
        stopReason: event.content.stopReason,
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
          errorSource: event.content.errorSource,
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
  protected override readonly router = "new" as const;
  private featureFlagsPromise: Promise<WhitelistableFeature[]> | undefined;

  protected async withFeatureFlaggedInputConfig(
    config: InputConfig,
    host: Host
  ): Promise<InputConfig> {
    if (host !== OPENAI_RESPONSES_HOST) {
      return config;
    }

    this.featureFlagsPromise ??= getFeatureFlags(this.authenticator);
    return withConciseOpenAIReasoningSummary(
      config,
      await this.featureFlagsPromise
    );
  }

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
    // Per-endpoint adjustments applied in order before schema validation
    // (defaults to identity). Some schemas reject provider-invalid combinations
    // (e.g. Anthropic requires temperature=1 with thinking), so the fix must land
    // before `parse`, not after.
    configParsers: Array<(config: InputConfig) => InputConfig> = [
      (config) => config,
    ],
    // Prompt cache key, forwarded only by OpenAI-compatible Responses surfaces
    // whose config schema accepts it. Left undefined elsewhere so provider
    // schemas that guard `cacheKey` to `undefined` still parse.
    cacheKey?: string
  ): InputConfig {
    const {
      specifications,
      forceToolCall,
      disableToolUse,
      toolSearchEnabled,
      previousMessageId,
    } = streamParameters;

    // Clamp the reasoning effort to the model's supported range. Some callers
    // default to "none" when no effort is set, but models like GPT-5 reject the
    // "none" effort their schema drops, so an unsupported effort falls back to
    // the model's minimum supported one (mirrors the legacy Anthropic client).
    // TODO(new_llm_router): this reliance on the legacy `supportedReasoningEfforts` is temporary.
    // Once the new router is fully rolled out, drop this clamp and rely on each
    // model constructor's own default reasoning effort instead.
    const supportedEfforts = this.modelConfig.supportedReasoningEfforts;
    const clampedReasoningEffort: ReasoningEffort | null =
      this.reasoningEffort !== null && !supportedEfforts[this.reasoningEffort]
        ? getMinimumReasoningEffort(supportedEfforts)
        : this.reasoningEffort;

    const config: InputConfig = {
      tools: specifications as ToolSpecification[],
      temperature: this.temperature ?? undefined,
      reasoning: {
        effort: mapReasoningEffort(
          clampedReasoningEffort,
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

    const parsedConfig = configParsers.reduce(
      (acc, parser) => parser(acc),
      config
    );

    return configSchema.parse({
      ...parsedConfig,
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
    llmParameters: LLMParameters<DustStreamEndpointConstructor>,
    modelConstructor: DustStreamEndpointConstructor
  ) {
    super(
      auth,
      llmParameters.modelInfo.endpoint.modelConfig.providerId,
      llmParameters
    );
    this.endpointConstructor = modelConstructor;
    this.model = new modelConstructor(llmParameters.credentials);

    const { host: api, region } = this.model.metadata();
    this.metadata = {
      ...this.metadata,
      inferenceProvider: api,
      inferenceRegion: inferenceRegionForEndpointRegion(region),
      region,
    };
  }

  protected async buildStreamRequestPayload(
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ) {
    const { host: api } = this.model.metadata();
    // Agent-platform (Vertex) has no request-level automatic cache_control, so it
    // needs an explicit breakpoint on the conversation tail (legacy's isLast).
    const explicitTailBreakpoint = api === AGENT_PLATFORM_HOST;
    // OpenAI-compatible Responses hosts consume `prompt_cache_key`. Use the
    // workspace and agent configuration so requests can reuse cached prefixes
    // across conversations. xAI recommends always setting it to route stable
    // prefixes to the same server:
    // https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits
    // (verified 2026-08-12). Other surfaces guard `cacheKey` to undefined.
    const cacheKey = getPromptCacheKeyForHost(api, metadata);
    const config = await this.withFeatureFlaggedInputConfig(
      this.buildConfig(
        streamParameters,
        this.model.constructor.configSchema,
        this.endpointConstructor.configParsers,
        cacheKey
      ),
      api
    );

    return this.model.buildRequestPayload(
      this.buildPayload(streamParameters, { explicitTailBreakpoint }),
      config
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

const PROMPT_CACHE_KEY_HOSTS = new Set<Host>([OPENAI_RESPONSES_HOST, XAI_HOST]);

export function getPromptCacheKeyForHost(
  host: Host,
  metadata?: LLMStreamMetadata
): string | undefined {
  return metadata && PROMPT_CACHE_KEY_HOSTS.has(host)
    ? getPromptCacheKey(metadata)
    : undefined;
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
    llmParameters: LLMParameters<DustStreamEndpointConstructor>,
    modelConstructor: DustStreamEndpointConstructor
  ) {
    super(auth, llmParameters, modelConstructor);
    this.noopMetaData = llmParameters.modelInfo.metaData;
  }

  protected override async buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ): Promise<NoopRequest> {
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
          reasoningTokens: null,
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

const LAB_TO_PROVIDER_ID: Record<Lab, ModelProviderIdType> = {
  openai: "openai",
  anthropic: "anthropic",
  mistral: "mistral",
  google: "google_ai_studio",
  deepseek: "deepseek",
  xai: "xai",
  noop: "noop",
  // Should never happen
  moonshot_ai: "fireworks",
  thinking_machines: "fireworks",
  z_ai: "fireworks",
};

/**
 * Batch transition: wraps a new `BatchEndpoint` and delegates batch submission,
 * polling, and result conversion to it. Returned by `getBatchLLM`.
 */
export class BatchEndpointTransition extends BaseTransition {
  private model: BatchEndpoint;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters<DustBatchEndpointConstructor>,
    modelConstructor: BatchEndpointConstructor
  ) {
    super(
      auth,
      LAB_TO_PROVIDER_ID[llmParameters.modelInfo.endpoint.lab],
      llmParameters
    );
    this.model = new modelConstructor(llmParameters.credentials);

    const { host: api, region } = this.model.metadata();
    this.metadata = {
      ...this.metadata,
      inferenceProvider: api,
      inferenceRegion: inferenceRegionForEndpointRegion(region),
      region,
    };
  }

  // Builds the per-request payload for tracing (the base class captures batch
  // inputs via this hook). Streaming itself is never invoked on a batch LLM.
  protected async buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ) {
    const { host } = this.model.metadata();
    const config = await this.withFeatureFlaggedInputConfig(
      this.buildConfig(streamParameters, this.model.constructor.configSchema),
      host
    );

    return this.model.buildRequestPayload(
      this.buildPayload(streamParameters),
      config
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
    const { host } = this.model.metadata();
    const requests = new Map<string, BatchRequest>();
    for (const [customId, streamParameters] of conversations) {
      requests.set(customId, {
        payload: this.buildPayload(streamParameters),
        config: await this.withFeatureFlaggedInputConfig(
          this.buildConfig(
            streamParameters,
            this.model.constructor.configSchema
          ),
          host
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
