import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type { MessageCountTokensParams } from "@anthropic-ai/sdk/resources";
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
import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { handleError } from "@app/lib/api/llm/clients/anthropic/utils/errors";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
  StructuredSystemPrompt,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types/api/credentials";
import type { WorkspaceType } from "@app/types/user";

/**
 * Maps prompt tiers to Anthropic system blocks with cache breakpoints.
 *
 * Each non-empty tier becomes a separate text block. Cache breakpoints are placed
 * between tiers so that stable prefixes can be reused even when later tiers change:
 *  1. Instructions  – long TTL (1h), stable per agent config.
 *  2. Shared context – default ephemeral (5min), shared across callers.
 *  3. Ephemeral context – no breakpoint needed (last block).
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
  private workspace: WorkspaceType;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: AnthropicWhitelistedModelId }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, ANTHROPIC_PROVIDER_ID, params);
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "DUST_MANAGED_ANTHROPIC_API_KEY environment variable is required"
      );
    }

    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    this.workspace = auth.getNonNullableWorkspace();
  }

  protected buildRequestPayload({
    conversation,
    hasConditionalJITTools,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): BetaMessageStreamParams {
    const messages = conversation.messages.map((msg, index, array) =>
      toMessage(msg, { isLast: index === array.length - 1 })
    );

    // Build thinking config, use custom type if specified.
    const thinkingConfig =
      this.modelConfig.customThinkingType === "auto"
        ? toAutoThinkingConfig(
            this.reasoningEffort,
            this.modelConfig.useNativeLightReasoning
          )
        : toThinkingConfig(
            this.reasoningEffort,
            this.modelConfig.useNativeLightReasoning
          );

    // Merge betas, always include structured-outputs, add custom betas if specified.
    // TODO(fabien): Remove beta tag and beta client when structured outputs are generally available.
    const betas = [
      "structured-outputs-2025-11-13",
      ...(this.modelConfig.customBetas ?? []),
    ];

    const system = buildSystemBlocks(normalizePrompt(prompt), {
      hasConditionalJITTools,
    });

    return {
      model: this.modelId,
      ...thinkingConfig,
      system,
      messages,
      temperature: this.temperature ?? undefined,
      stream: true,
      tools: specifications.map(toTool),
      max_tokens: this.modelConfig.generationTokensCount,
      tool_choice: toToolChoiceParam(specifications, forceToolCall),
      betas,
      output_format: toOutputFormatParam(this.responseFormat),
      cache_control: { type: "ephemeral" },
    };
  }

  protected async *sendRequest(
    payload: BetaMessageStreamParams
  ): AsyncGenerator<LLMEvent> {
    try {
      const events = this.client.beta.messages.stream(payload);

      const shouldCountReasoningTokens =
        this.reasoningEffort !== "none" &&
        (this.reasoningEffort !== "light" ||
          !!this.modelConfig.useNativeLightReasoning);

      const countTokens = shouldCountReasoningTokens
        ? (body: MessageCountTokensParams) =>
            this.client.messages.countTokens(body)
        : undefined;

      yield* streamLLMEvents(events, this.metadata, countTokens);
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
