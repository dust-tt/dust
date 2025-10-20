import { Mistral } from "@mistralai/mistralai";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { LLM } from "@app/lib/llm/llm";
import {
  toMessage,
  toTool,
} from "@app/lib/llm/providers/mistral/utils/conversation_to_mistral";
import { toEvents } from "@app/lib/llm/providers/mistral/utils/mistral_to_events";
import type { LLMEvent, ProviderMetadata } from "@app/lib/llm/types/events";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

export class MistralLLM extends LLM {
  private client: Mistral;
  private metadata: ProviderMetadata = {
    providerId: "mistral",
    modelId: this.model.modelId,
  };
  private textAccumulator = "";
  constructor({ model }: { model: ModelConfigurationType }) {
    super(model);
    this.client = new Mistral({
      apiKey: process.env.DUST_MANAGED_MISTRAL_API_KEY,
    });
  }

  private resetTextAccumulator() {
    this.textAccumulator = "";
  }
  private appendToTextAccumulator(text: string) {
    this.textAccumulator += text;
  }
  private getTextAccumulator() {
    return this.textAccumulator;
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
    this.resetTextAccumulator();

    const messages = [
      {
        role: "system" as const,
        content: prompt,
      },
      ...conversation.messages.map(toMessage),
    ];

    const events = await this.client.chat.stream({
      model: this.model.modelId,
      messages,
      temperature: 0.7,
      stream: true,
      toolChoice: "auto" as const,
      tools: specifications.map(toTool),
    });

    for await (const event of events) {
      const llmEvents = toEvents({
        completionEvent: event,
        metadata: this.metadata,
        accumulatorUtils: {
          appendToTextAccumulator: this.appendToTextAccumulator.bind(this),
          getTextAccumulator: this.getTextAccumulator.bind(this),
          resetTextAccumulator: this.resetTextAccumulator.bind(this),
        },
      });
      for (const childEvent of llmEvents) {
        yield childEvent;
      }
    }
  }
}
