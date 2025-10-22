import { Mistral } from "@mistralai/mistralai";
import compact from "lodash/compact";

import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/mistral/utils/conversation_to_mistral";
import { streamLLMEvents } from "@app/lib/api/llm/clients/mistral/utils/mistral_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent, ProviderMetadata } from "@app/lib/api/llm/types/events";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class MistralLLM extends LLM {
  private client: Mistral;
  private metadata: ProviderMetadata = {
    providerId: "mistral",
    modelId: this.model.modelId,
  };
  private temperature: number;
  constructor({
    model,
    options,
  }: {
    model: ModelConfigurationType;
    options?: LLMOptions;
  }) {
    super({ model, options });
    this.temperature =
      options?.temperature ?? AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced;
    const { MISTRAL_API_KEY } = dustManagedCredentials();
    if (!MISTRAL_API_KEY) {
      throw new Error("MISTRAL_API_KEY environment variable is required");
    }
    this.client = new Mistral({
      apiKey: MISTRAL_API_KEY,
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
    const messages = [
      {
        role: "system" as const,
        content: prompt,
      },
      ...compact(conversation.messages.map(toMessage)),
    ];

    const events = await this.client.chat.stream({
      model: this.model.modelId,
      messages,
      temperature: this.temperature,
      stream: true,
      toolChoice: "auto" as const,
      tools: specifications.map(toTool),
    });

    yield* streamLLMEvents({
      completionEvents: events,
      metadata: this.metadata,
    });
  }
}
