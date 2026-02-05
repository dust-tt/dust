import { OpenAI } from "openai";
import { Client } from "@/client";

import type { Payload } from "@/types/history";
import type {
  Gpt5220251211Config,
  GPT_5_2_2025_12_11_MODEL_ID,
} from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { WithMetadataStreamEvent } from "@/types/output";
import {
  convertOpenAIStreamToRouterEvents,
  toInput,
} from "@/providers/openai/utils";
import { OpenAIModelRouter } from "@/providers/openai/modelRouter";

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
    const model = OpenAIModelRouter.getModel(modelId);
    const input = toInput(payload);

    const stream = await this.client.responses.create({
      model: modelId,
      input,
      stream: true,
      ...model.toConfig(config),
    });

    yield* convertOpenAIStreamToRouterEvents(stream, modelId);
  }
}
