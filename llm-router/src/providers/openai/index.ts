import { OpenAI } from "openai";
import { Client } from "@/client";

import type { Payload } from "@/types/payload";
import type {
  Gpt5220251211Config,
  GPT_5_2_2025_12_11_MODEL_ID,
} from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { WithMetadataStreamEvent } from "@/types/output";
import { toEvents } from "@/providers/openai/toStream";

const toInput = (payload: Payload) => {
  return [
    ...payload.conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content.value,
    })),
    {
      role: "user" as const,
      content: payload.prompt.value,
    },
  ];
};

const toConfig = (config: Gpt5220251211Config) => {
  return {
    temperature: config.temperature?.value ?? null,
    max_output_tokens: config.maxOutputTokens?.value ?? null,
  };
};

export interface OpenAIClientConfig {
  apiKey: string;
  baseURL?: string;
}

export class OpenAIResponsesClient extends Client {
  private client: OpenAI;

  constructor(config: OpenAIClientConfig) {
    super();
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async *internalStream(
    modelId: typeof GPT_5_2_2025_12_11_MODEL_ID,
    payload: Payload,
    config: Gpt5220251211Config
  ): AsyncGenerator<WithMetadataStreamEvent, void> {
    const input = toInput(payload);

    const stream = await this.client.responses.create({
      model: modelId,
      input,
      stream: true,
      ...toConfig(config),
    });

    for await (const event of stream) {
      yield* toEvents(event, modelId);
    }
  }
}
