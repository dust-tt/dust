import Anthropic from "@anthropic-ai/sdk";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent, ProviderMetadata } from "@app/lib/api/llm/types/events";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import {
  dustManagedCredentials,
  type AgentReasoningEffort,
  type ModelConfigurationType,
  type ModelConversationTypeMultiActions,
} from "@app/types";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import { streamLLMEvents } from "./utils/anthropic_to_events";
import { toMessage, toTool } from "./utils/conversation_to_anthropic";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: ProviderMetadata = {
    providerId: "anthropic",
    modelId: this.model.modelId,
  };
  private temperature: number;
  private budgetTokens: number;
  private get isThinking(): boolean {
    return this.budgetTokens > 0;
  }

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

    const isClaude4 =
      model.modelId.startsWith("claude-4") ||
      model.modelId.startsWith("claude-sonnet-4");
    const calcBudget = (effort: AgentReasoningEffort, isClaude4: boolean) => {
      if (!isClaude4) {
        return 0;
      }
      switch (effort) {
        case "none":
        case "light":
          return 0;
        case "medium":
          return 1024;
        case "high":
          return 4096;
      }
    };

    this.budgetTokens = calcBudget(
      options?.reasoningEffort ?? "none",
      isClaude4
    );
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
    const thinking: ThinkingConfigParam | undefined = this.isThinking
      ? {
          type: "enabled",
          budget_tokens: this.budgetTokens,
        }
      : undefined;

    const events = this.client.messages.stream({
      model: this.model.modelId,
      thinking,
      system: prompt,
      messages: conversation.messages.map(toMessage),
      temperature: this.temperature,
      stream: true,
      tools: specifications.map(toTool),
      max_tokens: this.model.generationTokensCount,
    });

    yield* streamLLMEvents({
      messageStreamEvents: events,
      metadata: this.metadata,
    });
  }
}
