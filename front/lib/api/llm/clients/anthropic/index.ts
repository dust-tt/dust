import Anthropic from "@anthropic-ai/sdk";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent, ProviderMetadata } from "@app/lib/api/llm/types/events";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import {
  dustManagedCredentials,
  type ModelConfigurationType,
  type ModelConversationTypeMultiActions,
} from "@app/types";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import { streamLLMEvents } from "./utils/anthropic_to_events";
import { toMessage, toTool } from "./utils/conversation_to_anthropic";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import { CLAUDE_4_THINKING_BUDGET_TOKENS, isClaude4 } from "./utils";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: ProviderMetadata = {
    providerId: "anthropic",
    modelId: this.model.modelId,
  };
  private temperature: number;
  private thinkingConfig?: ThinkingConfigParam;

  constructor({
    model,
    options,
  }: {
    model: ModelConfigurationType;
    options?: LLMOptions;
  }) {
    super({ model, options });
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.temperature =
      options?.temperature ?? AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced;

    if (this.options?.reasoningEffort) {
      const effort = this.options?.reasoningEffort;
      this.thinkingConfig = {
        type: "enabled",
        budget_tokens: isClaude4(this.model)
          ? CLAUDE_4_THINKING_BUDGET_TOKENS[effort]
          : 0,
      };
    }
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async *stream({
    conversation,
    prompt,
    specifications,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<LLMEvent> {
    const events = this.client.messages.stream({
      model: this.model.modelId,
      thinking: this.thinkingConfig,
      system: prompt,
      messages: conversation.messages.map(toMessage),
      temperature: this.temperature,
      stream: true,
      tools: specifications.map(toTool),
      max_tokens: this.model.generationTokensCount,
    });

    yield* streamLLMEvents(events, this.metadata);
  }
}
