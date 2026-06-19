import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import type AnthropicVertex from "@anthropic-ai/vertex-sdk";
import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import {
  ANTHROPIC_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/anthropic/types";
import {
  toAutoThinkingConfig,
  toOutputFormatParam,
  toThinkingConfig,
  toToolChoiceParam,
} from "@app/lib/api/llm/clients/anthropic/utils";
import {
  batchResultToLLMEvents,
  streamLLMEvents,
} from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import {
  toMessage,
  toToolsParam,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import {
  handleError,
  handleInvalidToolJsonAnthropicError,
  isAnthropicErrorUnableToParseToolParam,
} from "@app/lib/api/llm/clients/anthropic/utils/errors";
import {
  getInferenceClient,
  getModel,
} from "@app/lib/api/llm/clients/anthropic/utils/vertex";
import { LLM } from "@app/lib/api/llm/llm";
import type { BatchResult, BatchStatus } from "@app/lib/api/llm/types/batch";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
  StructuredSystemPrompt,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { getMinimumReasoningEffort } from "@app/types/assistant/models/types";
import assert from "assert";

const MESSAGE_CONVERSION_CONCURRENCY = 10;
const BATCH_PAYLOAD_BUILD_CONCURRENCY = 10;

// Required (with exactly this date) for the `fallbacks` request param; any
// other server-side-fallback-* value gets the request rejected with a 400.
// https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback#server-side-fallback
const SERVER_SIDE_FALLBACK_BETA_HEADER = "server-side-fallback-2026-06-01";

// Opts into prompt-cache diagnostics: the API compares this request's prefix
// against the one identified by `diagnostics.previous_message_id` and returns a
// `cache_miss_reason`. Claude API only (not supported on Vertex AI).
// https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics
const CACHE_DIAGNOSTICS_BETA_HEADER = "cache-diagnosis-2026-04-07";

// Server-side fallback is a beta param not yet typed by the SDK (0.100.1). We
// forward it as an extra body param on the streaming request. The list of
// fallback model ids is driven by modelConfig.fallbackModels, so no fallback
// target is hardcoded here. Scoped to the streaming path only: the Message
// Batches API rejects the fallbacks param.
type AnthropicStreamPayload = BetaMessageStreamParams & {
  fallbacks?: { model: string }[];
};

/**
 * Maps prompt tiers to Anthropic system blocks with cache breakpoints.
 *
 * Anthropic allows at most 4 cache breakpoints per request (system + messages combined).
 * Automatic caching (top-level cache_control on the request) consumes one slot.
 * The full 4-slot budget across the request is:
 *
 *  Slot 1 – system: instructions block    (1h TTL, stable per agent config), only targets some global agents
 *  Slot 2 – system: shared context block  (5min TTL, shared across callers)
 *  Slot 3 – messages[0]: equipped skills  (5min TTL, stable per agent within a workspace;
 *                                          set in conversation_to_anthropic.ts when name="system")
 *  Slot 4 – Anthropic API: automatic cache_control (5min TTL, auto-placed at last cacheable block;
 *                                          added as top-level field in buildStreamRequestPayload;
 *                                          NOT added on Vertex AI to stay within the 4-slot limit)
 *         – Vertex AI:     explicit last-message breakpoint (5min TTL; Vertex does not support
 *                                          automatic caching, so the last message is marked
 *                                          explicitly via isLast in buildBaseRequestPayload)
 *
 * Each non-empty system tier becomes a separate text block. Breakpoints are placed
 * between tiers so that stable prefixes can be reused even when later tiers change:
 *  1. Instructions      – long TTL (1h), stable per agent config.
 *  2. Shared context    – default ephemeral (5min), shared across callers.
 *  3. Ephemeral context – no breakpoint (covered by automatic caching as last block).
 *
 * /!\ Do not add breakpoints here without auditing total usage across the request.
 */
function buildSystemBlocks(
  { instructions, sharedContext, ephemeralContext }: StructuredSystemPrompt,
  { hasConditionalJITTools }: { hasConditionalJITTools?: boolean }
) {
  const instructionsText = instructions.map((s) => s.content).join("\n");
  const sharedText = sharedContext.map((s) => s.content).join("\n");
  const ephemeralText = ephemeralContext.map((s) => s.content).join("\n");

  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [];

  if (instructionsText) {
    // If we have conditional JIT tools, we expect more variability in the instructions, so we keep
    // the default ephemeral cache. Otherwise, we can set a longer TTL to maximize cache hits.
    const ttl: "1h" | undefined = hasConditionalJITTools ? undefined : "1h";
    system.push({
      type: "text",
      text: instructionsText,
      cache_control: { type: "ephemeral", ttl },
    });
  }

  if (sharedText) {
    system.push({
      type: "text",
      text: sharedText,
      cache_control: { type: "ephemeral" },
    });
  }

  if (ephemeralText) {
    system.push({
      type: "text",
      text: ephemeralText,
    });
  }

  return system;
}

export class AnthropicLLM extends LLM<BetaMessageStreamParams> {
  private client: Anthropic;
  private inferenceClient: Anthropic | AnthropicVertex;
  private omittedThinking: boolean;
  private useVertex: boolean;
  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & {
      modelId: AnthropicWhitelistedModelId;
      useVertex?: boolean;
    }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, ANTHROPIC_PROVIDER_ID, params);
    const { ANTHROPIC_API_KEY } = llmParameters.credentials;
    assert(ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY credential is required");
    this.omittedThinking = params.omittedThinking ?? false;

    this.useVertex = llmParameters.useVertex ?? false;
    if (this.useVertex) {
      this.metadata = {
        ...this.metadata,
        inferenceProvider: "google_vertex_ai",
        inferenceRegion: "eu",
      };
    }
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    // Vertex does not support batches.
    this.inferenceClient = getInferenceClient(this.useVertex, "eu", {
      anthropicClient: this.client,
    });
  }

  private async buildBaseRequestPayload({
    conversation,
    hasConditionalJITTools,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): Promise<MessageCreateParamsNonStreaming> {
    const messages = await concurrentExecutor(
      conversation.messages,
      (msg, index) =>
        toMessage(msg, {
          isFirst: index === 0,
          // Vertex AI does not support automatic caching, so we need an explicit breakpoint on the
          // last message. On the Anthropic API the top-level cache_control handles this.
          isLast: this.useVertex && index === conversation.messages.length - 1,
          omittedThinking: this.omittedThinking,
          convertToBase64: this.useVertex,
        }),
      { concurrency: MESSAGE_CONVERSION_CONCURRENCY }
    );

    // Clamp the reasoning effort to the model's supported range. Some callers
    // default to "none" when no effort is set, but models like Claude Fable 5
    // reject the explicit disabled thinking that "none" maps to, so an
    // unsupported effort falls back to the model's minimum supported one.
    const supportedEfforts = this.modelConfig.supportedReasoningEfforts;
    const reasoningEffort: ReasoningEffort | null =
      this.reasoningEffort !== null && !supportedEfforts[this.reasoningEffort]
        ? getMinimumReasoningEffort(supportedEfforts)
        : this.reasoningEffort;

    // Build thinking config, use custom type if specified.
    const thinkingConfig =
      this.modelConfig.customThinkingType === "auto"
        ? toAutoThinkingConfig(
            reasoningEffort,
            this.modelConfig.useNativeLightReasoning,
            this.omittedThinking
          )
        : toThinkingConfig(
            reasoningEffort,
            this.modelConfig.useNativeLightReasoning
          );

    const system = buildSystemBlocks(normalizePrompt(prompt), {
      hasConditionalJITTools,
    });

    return {
      model: this.modelId,
      ...thinkingConfig,
      system,
      messages,
      temperature: this.temperature ?? undefined,
      tools: toToolsParam(specifications, forceToolCall),
      max_tokens: this.modelConfig.generationTokensCount,
      tool_choice: toToolChoiceParam(specifications, forceToolCall),
    };
  }

  // Builds the server-side fallback param from modelConfig.fallbackModels, or
  // undefined when none are configured (so the param is omitted entirely).
  // Server-side fallback is not available on Vertex AI, so it is never attached
  // to Vertex requests.
  private buildFallbacksParam(): { model: string }[] | undefined {
    const fallbackModels = this.modelConfig.fallbackModels;
    if (this.useVertex || !fallbackModels || fallbackModels.length === 0) {
      return undefined;
    }
    return fallbackModels.map((model) => ({ model }));
  }

  protected async buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ): Promise<BetaMessageStreamParams> {
    const basePayload = await this.buildBaseRequestPayload(streamParameters);
    const outputFormat = toOutputFormatParam(this.responseFormat);
    const fallbacks = this.buildFallbacksParam();

    // Prompt-cache diagnostics is Claude API only and is opted into per request
    // by the caller passing `previousMessageId` (tri-state: undefined = off).
    // `null` is a valid opt-in value (first call, nothing to compare yet).
    // NOTE: when model_constructors goes live, this inject must move to its
    // Anthropic request builder. This older client stack is the one in prod today.
    const cacheDiagnosticsEnabled =
      !this.useVertex && streamParameters.previousMessageId !== undefined;

    // The fallbacks param is rejected unless the request carries the
    // server-side fallback beta header, so the header is attached here rather
    // than left to customBetas (which could drift out of sync).
    const betas = [
      ...(this.modelConfig.customBetas ?? []),
      ...(fallbacks ? [SERVER_SIDE_FALLBACK_BETA_HEADER] : []),
      ...(cacheDiagnosticsEnabled ? [CACHE_DIAGNOSTICS_BETA_HEADER] : []),
    ];

    const payload: AnthropicStreamPayload = {
      ...basePayload,
      stream: true,
      betas: betas.length > 0 ? betas : undefined,
      output_config: outputFormat
        ? { ...basePayload.output_config, format: outputFormat }
        : basePayload.output_config,
      // Automatic caching is not supported on Vertex AI; the explicit breakpoints in
      // buildBaseRequestPayload (isFirst and isLast) cover Vertex instead.
      ...(!this.useVertex ? { cache_control: { type: "ephemeral" } } : {}),
      ...(cacheDiagnosticsEnabled
        ? {
            diagnostics: {
              previous_message_id: streamParameters.previousMessageId,
            },
          }
        : {}),
      model: getModel(this.useVertex, { modelId: this.modelId }),
      ...(fallbacks ? { fallbacks } : {}),
    };
    return payload;
  }

  protected async *sendRequest(
    payload: BetaMessageStreamParams
  ): AsyncGenerator<LLMEvent> {
    try {
      const events = this.inferenceClient.beta.messages.stream(payload);

      yield* streamLLMEvents(events, this.metadata);
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else if (isAnthropicErrorUnableToParseToolParam(err)) {
        // The SDK's BetaMessageStream throws an AnthropicError (not APIError) when
        // it fails to parse tool parameter JSON client-side. Mark retryable.
        yield handleInvalidToolJsonAnthropicError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }

  protected override async internalSendBatchProcessing(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    const requests = await concurrentExecutor(
      Array.from(conversations.entries()),
      async ([customId, streamParams]) => ({
        custom_id: customId,
        params: await this.buildBaseRequestPayload(streamParams),
      }),
      { concurrency: BATCH_PAYLOAD_BUILD_CONCURRENCY }
    );

    const batch = await this.client.messages.batches.create({ requests });
    return batch.id;
  }

  override async deleteBatch(batchId: string): Promise<boolean> {
    await this.client.messages.batches.delete(batchId);
    return true;
  }

  override async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    return batch.processing_status === "ended" ? "ready" : "computing";
  }

  protected override async internalGetBatchResult(
    batchId: string
  ): Promise<BatchResult> {
    const results = await this.client.messages.batches.results(batchId);
    const batchResult: BatchResult = new Map();

    for await (const item of results) {
      const events = await batchResultToLLMEvents(item.result, this.metadata);
      batchResult.set(item.custom_id, events);
    }

    return batchResult;
  }
}
