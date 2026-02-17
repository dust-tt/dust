import { OpenAI } from "openai";
import type { z } from "zod";

import { BaseClient } from "@/baseClient";
import type { OpenAIModel as OpenAIModelClass } from "@/providers/openai/model";
import {
  GPT_5_2_2025_12_11_MODEL_ID,
  GptFiveDotTwoV20251211,
} from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { OpenAIModelId } from "@/providers/openai/types";
import { toInput } from "@/providers/openai/utils/toInput";
import { convertOpenAIStreamToRouterEvents } from "@/providers/openai/utils/toStream";
import type { Payload } from "@/types/history";
import type { WithMetadataStreamEvent } from "@/types/output";

type OpenAIModelConstructor = new () => OpenAIModelClass;

const MODEL_REGISTRY: Record<OpenAIModelId, OpenAIModelConstructor> = {
  [GPT_5_2_2025_12_11_MODEL_ID]: GptFiveDotTwoV20251211,
};

const getOpenAIModel = (modelId: OpenAIModelId): OpenAIModelClass => {
  const ModelClass = MODEL_REGISTRY[modelId];

  if (!ModelClass) {
    throw new Error(`Unsupported model id: ${modelId}`);
  }

  return new ModelClass();
};

export interface OpenAIClientConfig {
  apiKey: string;
  baseURL?: string;
}

export class OpenAIResponsesClient extends BaseClient {
  private client: OpenAI;

  constructor(config: OpenAIClientConfig) {
    super();
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async *internalStream(
    modelId: typeof GptFiveDotTwoV20251211.modelId,
    payload: Payload,
    config: z.input<typeof GptFiveDotTwoV20251211.configSchema>
  ): AsyncGenerator<WithMetadataStreamEvent, void> {
    const model = getOpenAIModel(modelId);
    const input = toInput(payload, modelId);

    const stream = await this.client.responses.create({
      model: modelId,
      input,
      stream: true,
      ...model.toConfig(config),
    });

    yield* convertOpenAIStreamToRouterEvents(stream, modelId);
  }
}
