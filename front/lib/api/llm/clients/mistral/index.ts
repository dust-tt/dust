import { Mistral } from "@mistralai/mistralai";

import type { MistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/mistral/utils/conversation_to_mistral";
import { streamLLMEvents } from "@app/lib/api/llm/clients/mistral/utils/mistral_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

export class MistralLLM extends LLM {
  private client: Mistral;

  constructor(
    auth: Authenticator,
    {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
    }: LLMParameters & { modelId: MistralWhitelistedModelId }
  ) {
    super(auth, {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
      clientId: "mistral",
    });
    const { MISTRAL_API_KEY } = dustManagedCredentials();
    if (!MISTRAL_API_KEY) {
      throw new Error("MISTRAL_API_KEY environment variable is required");
    }
    this.client = new Mistral({
      apiKey: MISTRAL_API_KEY,
    });
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
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
