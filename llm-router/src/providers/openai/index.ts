import { OpenAI } from "openai";
import { Client } from "@/client";

import type { Payload } from "@/types/history";
import type {
  Gpt5220251211Config,
  GPT_5_2_2025_12_11_MODEL_ID,
} from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { WithMetadataStreamEvent } from "@/types/output";
import { convertOpenAIStreamToRouterEvents } from "@/providers/openai/toStream";

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

const reasoningEffortMapping = {
  none: "none",
  very_low: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  very_high: "xhigh",
};
const reasoningDetailsLevelMapping = {
  low: "concise",
  high: "detailed",
};

const toConfig = (config: Gpt5220251211Config) => {
  const baseConfig: Record<string, unknown> = {
    max_output_tokens: config.maxOutputTokens ?? null,
    reasoning: {
      effort: reasoningEffortMapping[config.reasoningEffort ?? "none"],
      summary:
        reasoningDetailsLevelMapping[config.reasoningDetailsLevel ?? "high"],
    },
    temperature: config.temperature ?? 1,
    top_p: config.topProbability ?? 0.98,
    top_logprobs: config.topLogprobs ?? 0,
  };

  return baseConfig;
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

    yield* convertOpenAIStreamToRouterEvents(stream, modelId);
  }
}
