import Anthropic, { APIError } from "@anthropic-ai/sdk";

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
  SystemPromptContext,
  SystemPromptInstruction,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

/**
 * Maps prompt sections to Anthropic system blocks.
 *
 * Each non-empty group in [instructions, context] becomes a separate system block.
 * Both currently use the default 5min cache TTL. Once we remove entropy from
 * instructions, we can use extended-cache-ttl (1h) for better cache savings.
 */
function buildSystemBlocks([instructions, context]: [
  SystemPromptInstruction[],
  SystemPromptContext[],
]) {
  const instructionsText = instructions.map((s) => s.content).join("\n");
  const contextText = context.map((s) => s.content).join("\n");

  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [];
  if (instructionsText) {
    system.push({
      type: "text",
      text: instructionsText,
      cache_control: { type: "ephemeral" },
    });
  }
  if (contextText) {
    system.push({
      type: "text",
      text: contextText,
      cache_control: { type: "ephemeral" },
    });
  }

  return system;
}

export class AnthropicLLM extends LLM {
  private client: Anthropic;

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
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const messages = conversation.messages.map((msg, index, array) =>
        toMessage(msg, { isLast: index === array.length - 1 })
      );

      // Build thinking config, use custom type if specified.
      const thinkingConfig =
        this.modelConfig.customThinkingType === "auto"
          ? toAutoThinkingConfig(this.reasoningEffort)
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

      const system = buildSystemBlocks(normalizePrompt(prompt));

      const events = this.client.beta.messages.stream({
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
      } as Parameters<typeof this.client.beta.messages.stream>[0]);

      yield* streamLLMEvents(events, this.metadata);
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
