import Anthropic from "@anthropic-ai/sdk";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import { CLAUDE_4_THINKING_BUDGET_TOKENS } from "@app/lib/api/llm/clients/anthropic/utils";
import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import type { SUPPORTED_MODEL_CONFIGS } from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private readonly thinkingConfig?: ThinkingConfigParam;
  private modelConfig: (typeof SUPPORTED_MODEL_CONFIGS)[number];

  constructor(
    auth: Authenticator,
    {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
    }: LLMParameters & { modelId: AnthropicWhitelistedModelId }
  ) {
    super(auth, {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      context,
      clientId: "anthropic",
    });
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    this.modelConfig = getSupportedModelConfig({
      modelId: this.modelId,
      providerId: "anthropic",
    });

    if (reasoningEffort && reasoningEffort != "none") {
      this.thinkingConfig = {
        type: "enabled",
        budget_tokens: CLAUDE_4_THINKING_BUDGET_TOKENS[reasoningEffort],
      };
    }
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    const messages = conversation.messages.map(toMessage);

    const events = this.client.messages.stream({
      model: this.modelId,
      thinking: this.thinkingConfig,
      system: prompt,
      messages,
      // Thinking isn’t compatible with temperature: `temperature` may only be set to 1 when thinking is enabled.
      temperature: this.thinkingConfig ? 1 : this.temperature,
      stream: true,

      tools: specifications.map(toTool),
      max_tokens: this.modelConfig.generationTokensCount,
    });

    yield* streamLLMEvents(events, this.metadata);
  }
}
