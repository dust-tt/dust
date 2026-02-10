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
  SystemPromptSection,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

/**
 * Maps prompt sections to Anthropic system blocks with two caching tiers:
 * - "instructions" sections get 1h TTL (stable across calls for a given agent).
 * - "context" sections get the default 5min TTL (per-request data).
 * Instructions must come before context (Anthropic requires longer TTL first).
 */
function buildSystemBlocks(prompt: SystemPromptSection[]) {
  const instructionsText = prompt
    .filter((s) => s.role === "instructions")
    .map((s) => s.content)
    .join("\n");

  const contextText = prompt
    .filter((s) => s.role === "context")
    .map((s) => s.content)
    .join("\n");

  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [];
  if (instructionsText) {
    system.push({
      type: "text",
      text: instructionsText,
      cache_control: { type: "ephemeral", ttl: "1h" },
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

      // Merge betas, always include structured-outputs and extended-cache-ttl,
      // add custom betas if specified.
      // TODO(fabien): Remove beta tag and beta client when structured outputs are generally available.
      const betas = [
        "structured-outputs-2025-11-13",
        "extended-cache-ttl-2025-04-11",
        ...(this.modelConfig.customBetas ?? []),
      ];

      // Build system blocks from structured prompt sections.
      // Instructions sections get 1h TTL, context sections get default 5m TTL.
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
