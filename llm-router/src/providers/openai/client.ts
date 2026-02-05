import { OpenAI } from "openai";
import { Client } from "@/client";
import { z } from "zod";

import type { Payload } from "@/types/history";
import type { GPT_5_2_2025_12_11 } from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { WithMetadataStreamEvent } from "@/types/output";
import { convertOpenAIStreamToRouterEvents } from "@/providers/openai/utils/toStream";
import { toInput } from "@/providers/openai/utils/toInput";
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
    modelId: typeof GPT_5_2_2025_12_11.modelId,
    payload: Payload,
    config: z.input<typeof GPT_5_2_2025_12_11.configSchema>
  ): AsyncGenerator<WithMetadataStreamEvent, void> {
    const model = OpenAIModelRouter.getModel(modelId);
    const input = toInput(payload);

    // llm-router/node_modules/openai/src/resources/responses/responses.ts
    const stream = await this.client.responses.create({
      model: modelId,
      input,
      stream: true,
      ...model.toConfig(config),
    });

    yield* convertOpenAIStreamToRouterEvents(stream, modelId);
  }
}
