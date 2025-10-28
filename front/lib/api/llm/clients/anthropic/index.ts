import Anthropic from "@anthropic-ai/sdk";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AnthropicPayload } from "@app/lib/api/llm/clients/anthropic/utils";
import { CLAUDE_4_THINKING_BUDGET_TOKENS } from "@app/lib/api/llm/clients/anthropic/utils";
import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent, ProviderMetadata } from "@app/lib/api/llm/types/events";
import type { ModelConversationTypeMultiActions } from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: ProviderMetadata = {
    providerId: "anthropic",
    modelId: this.model.modelId,
  };
  private temperature?: number;
  private thinkingConfig?: ThinkingConfigParam;

  constructor({ model, options }: AnthropicPayload) {
    super({ model, options });
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.temperature = options?.temperature;

    if (options?.reasoningEffort) {
      this.thinkingConfig = {
        type: "enabled",
        budget_tokens:
          CLAUDE_4_THINKING_BUDGET_TOKENS[options?.reasoningEffort],
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
      temperature: !this.thinkingConfig ? this.temperature : 1,
      stream: true,
      tools: specifications.map(toTool),
      max_tokens: this.model.generationTokensCount,
    });

    yield* streamLLMEvents(events, this.metadata);
  }
}
