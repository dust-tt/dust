import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type {
  MessageCountTokensParams,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";

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
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { handleError } from "@app/lib/api/llm/clients/anthropic/utils/errors";
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
import assert from "assert";

import * as fs from "fs";
import * as path from "path";

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

export class AnthropicLLM extends LLM<BetaMessageStreamParams> {
  private client: Anthropic;
  private omittedThinking: boolean;
  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: AnthropicWhitelistedModelId }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, ANTHROPIC_PROVIDER_ID, params);
    const { ANTHROPIC_API_KEY } = llmParameters.credentials;
    assert(ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY credential is required");
    this.omittedThinking = params.omittedThinking ?? false;

    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  private buildBaseRequestPayload({
    conversation,
    hasConditionalJITTools,
    prompt,
    specifications,
    forceToolCall,
    omittedThinking = this.omittedThinking,
  }: LLMStreamParameters): MessageCreateParamsNonStreaming {
    const messages = conversation.messages.map((msg, index, array) =>
      toMessage(msg, {
        isLast: index === array.length - 1,
        omittedThinking: this.omittedThinking,
      })
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
  ): BetaMessageStreamParams {
    // Merge betas, always include structured-outputs, add custom betas if specified.
    // TODO(fabien): Remove beta tag and beta client when structured outputs are generally available.
    const betas = [
      "structured-outputs-2025-11-13",
      ...(this.modelConfig.customBetas ?? []),
    ];

    return {
      ...this.buildBaseRequestPayload(streamParameters),
      stream: true,
      betas,
      output_format: toOutputFormatParam(this.responseFormat),
      cache_control: { type: "ephemeral" },
    };
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
      this.client.messages.countTokens(body);
  }

  protected async *sendRequest(
    payload: BetaMessageStreamParams
  ): AsyncGenerator<LLMEvent> {
    try {
      await fs.promises.writeFile(
        path.join(__dirname, `payload_${Date.now().toString()}.json`),
        JSON.stringify(payload, null, 2),
        "utf8"
      );
      const events = this.client.beta.messages.stream(payload);

      yield* streamLLMEvents(
        events,
        this.metadata,
        this.createCountTokensCallback()
      );
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }

  protected override async internalSendBatchProcessing(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    const requests = Array.from(conversations.entries()).map(
      ([customId, streamParams]) => ({
        custom_id: customId,
        params: this.buildBaseRequestPayload(streamParams),
      })
    );

    const batch = await this.client.messages.batches.create({ requests });
    return batch.id;
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
