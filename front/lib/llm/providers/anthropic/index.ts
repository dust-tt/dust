import Anthropic from "@anthropic-ai/sdk";
import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages.mjs";

import { LLM } from "@app/lib/llm/llm";
import { toEvents } from "@app/lib/llm/providers/anthropic/utils/anthropic_to_events";
import type {
  LLMEvent,
  LLMOutputItem,
  ProviderMetadata,
} from "@app/lib/llm/types";
import type {
  AgentReasoningEffort,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

import { toMessages } from "./utils/conversation_to_anthropic";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: ProviderMetadata = {
    providerId: "anthropic",
    modelId: this.model.modelId,
  };
  private itemsAccumulator: LLMOutputItem[] = [];
  protected temperature: number;
  protected reasoningEffort: AgentReasoningEffort;
  constructor({
    model,
    temperature,
    reasoningEffort,
  }: {
    temperature: number;
    model: ModelConfigurationType;
    reasoningEffort: AgentReasoningEffort;
  }) {
    super(model);
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.temperature = temperature;
    this.reasoningEffort = reasoningEffort;
  }

  private resetAccumulatorItems(): void {
    this.itemsAccumulator = [];
  }

  private appendToAccumulatorItems(item: LLMOutputItem): void {
    this.itemsAccumulator.push(item);
  }

  private getItemsAccumulator(): LLMOutputItem[] {
    return this.itemsAccumulator;
  }

  private updateMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }

  async *modelStream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<MessageStreamEvent> {
    const events = await this.client.messages.stream({
      model: this.model.modelId,
      thinking:
        this.reasoningEffort !== "none"
          ? {
              type: "enabled",
              budget_tokens: 16000,
            }
          : undefined,
      system: prompt,
      messages: toMessages(conversation),
      temperature: 1, //this.temperature,
      stream: true,
      max_tokens: 64000,
    });

    yield* events;
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMEvent> {
    this.resetAccumulatorItems();
    const events = await this.modelStream({ conversation, prompt });

    for await (const event of events) {
      const llmEvents = toEvents({
        messageStreamEvent: event,
        metadata: this.metadata,
        updateMetadata: this.updateMetadata.bind(this),
        accumulatorUtils: {
          resetItemsAccumulator: this.resetAccumulatorItems.bind(this),
          appendToItemsAccumulator: this.appendToAccumulatorItems.bind(this),
          getItemsAccumulator: this.getItemsAccumulator.bind(this),
        },
      });
      yield* llmEvents;
    }
  }
}
