import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type {
  MessageCountTokensParams,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import AnthropicVertex from "@anthropic-ai/vertex-sdk";

import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import {
  ANTHROPIC_PROVIDER_ID,
  overwriteLLMParameters,
  VERTEX_MODEL_ID_MAP,
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
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import {
  handleError,
  handleInvalidToolJsonAnthropicError,
  isAnthropicErrorUnableToParseToolParam,
} from "@app/lib/api/llm/clients/anthropic/utils/errors";
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
import { config } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import assert from "assert";

/**
 * Maps prompt tiers to Anthropic system blocks with cache breakpoints.
 *
 * Each non-empty tier becomes a separate text block. Cache breakpoints are placed
 * between tiers so that stable prefixes can be reused even when later tiers change:
 *  1. Instructions      – long TTL (1h), stable per agent config.
 *  2. Shared context    – default ephemeral (5min), shared across callers.
 *  3. Ephemeral context – no breakpoint needed (last block).
 *
 * IMPORTANT: Anthropic allows at most 4 cache breakpoints per request (system + messages combined).
 * This function uses up to 2 (instructions + shared context).
 * The remaining budget is for the global + conversation message breakpoints.
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

export class AnthropicLLM extends LLM<LLMStreamParameters> {
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
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    const region =
      config.getCurrentRegion() === "us-central1" ? "global" : "europe-west1";

    // Vertex does not support batches
    this.inferenceClient = this.useVertex
      ? new AnthropicVertex({
          region,
        })
      : this.client;
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
          isLast: index === conversation.messages.length - 1,
          omittedThinking: this.omittedThinking,
          convertToBase64: this.useVertex,
        }),
      { concurrency: 10 }
    );

    // Build thinking config, use custom type if specified.
    const thinkingConfig =
      this.modelConfig.customThinkingType === "auto"
        ? toAutoThinkingConfig(
            this.reasoningEffort,
            this.modelConfig.useNativeLightReasoning,
            this.omittedThinking
          )
        : toThinkingConfig(
            this.reasoningEffort,
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
      tools: specifications.map(toTool),
      max_tokens: this.modelConfig.generationTokensCount,
      tool_choice: toToolChoiceParam(specifications, forceToolCall),
    };
  }

  protected buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ): LLMStreamParameters {
    // Just capture the parameters; message conversion (async) happens in sendRequest.
    return streamParameters;
  }

  private createCountTokensCallback() {
    const shouldCountReasoningTokens =
      this.reasoningEffort !== "none" &&
      (this.reasoningEffort !== "light" ||
        !!this.modelConfig.useNativeLightReasoning);

    if (!shouldCountReasoningTokens) {
      return undefined;
    }

    return (body: MessageCountTokensParams) =>
      this.inferenceClient.messages.countTokens({
        ...body,
        model: this.getModel(),
      });
  }

  private getModel(): string {
    if (!this.useVertex) {
      return this.modelId;
    }

    return VERTEX_MODEL_ID_MAP[this.modelId] ?? this.modelId;
  }

  protected async *sendRequest(
    streamParameters: LLMStreamParameters
  ): AsyncGenerator<LLMEvent> {
    const betas = this.modelConfig.customBetas;

    const basePayload = await this.buildBaseRequestPayload(streamParameters);
    const outputFormat = toOutputFormatParam(this.responseFormat);

    const payload: BetaMessageStreamParams = {
      ...basePayload,
      stream: true,
      betas,
      output_config: outputFormat
        ? { ...basePayload.output_config, format: outputFormat }
        : basePayload.output_config,
      cache_control: { type: "ephemeral" },
      model: this.getModel(),
    };

    try {
      const events = this.inferenceClient.beta.messages.stream(payload);

      yield* streamLLMEvents(
        events,
        this.metadata,
        this.createCountTokensCallback()
      );
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
      { concurrency: 10 }
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
      const events = await batchResultToLLMEvents(
        item.result,
        this.metadata,
        this.createCountTokensCallback()
      );
      batchResult.set(item.custom_id, events);
    }

    return batchResult;
  }
}
