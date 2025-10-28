import { Mistral } from "@mistralai/mistralai";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { MistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/mistral/utils/conversation_to_mistral";
import { streamLLMEvents } from "@app/lib/api/llm/clients/mistral/utils/mistral_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
} from "@app/lib/api/llm/types/options";
import type { ModelConversationTypeMultiActions } from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class MistralLLM extends LLM {
  private client: Mistral;
  private metadata: LLMClientMetadata = {
    clientId: "mistral",
    modelId: this.modelId,
  };
  constructor({
    modelId,
    temperature,
    reasoningEffortId,
    bypassFeatureFlag,
  }: LLMParameters & { modelId: MistralWhitelistedModelId }) {
    super({
      modelId,
      temperature,
      reasoningEffortId,
      bypassFeatureFlag,
    });
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
      ...conversation.messages.map(toMessage),
    ];

    const completionEvents = await this.client.chat.stream({
      model: this.modelId,
      messages,
      temperature: this.temperature,
      stream: true,
      toolChoice: "auto" as const,
      tools: specifications.map(toTool),
    });

    yield* streamLLMEvents({
      completionEvents,
      metadata: this.metadata,
    });
  }
}
