import Anthropic from "@anthropic-ai/sdk";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
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
  LLMClientMetadata,
  LLMParameters,
} from "@app/lib/api/llm/types/options";
import type { ModelConversationTypeMultiActions } from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: LLMClientMetadata = {
    clientId: "anthropic",
    modelId: this.modelId,
  };
  private thinkingConfig?: ThinkingConfigParam;

  constructor({
    modelId,
    temperature,
    reasoningEffort,
    bypassFeatureFlag,
  }: LLMParameters & { modelId: AnthropicWhitelistedModelId }) {
    super({ modelId, temperature, reasoningEffort, bypassFeatureFlag });
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    if (reasoningEffort) {
      this.thinkingConfig = {
        type: "enabled",
        budget_tokens: CLAUDE_4_THINKING_BUDGET_TOKENS[reasoningEffort],
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
      model: this.modelId,
      thinking: this.thinkingConfig,
      system: prompt,
      messages: conversation.messages.map(toMessage),
      temperature: !this.thinkingConfig ? this.temperature : 1,
      stream: true,
      tools: specifications.map(toTool),
      // TODO fabien
      // max_tokens: this.model.generationTokensCount,
      max_tokens: 64000,
    });

    yield* streamLLMEvents(events, this.metadata);
  }
}
