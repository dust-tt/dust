import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import { BaseClient } from "@/baseClient";
import type { AnthropicModel as AnthropicModelClass } from "@/providers/anthropic/model";
import {
  CLAUDE_SONNET_4_5_20250929_MODEL_ID,
  ClaudeSonnet4_5V20250929,
} from "@/providers/anthropic/models/claude-sonnet-4-5-20250929";
import type { AnthropicModelId } from "@/providers/anthropic/types";
import { toInput } from "@/providers/anthropic/utils/toInput";
import { convertAnthropicStreamToRouterEvents } from "@/providers/anthropic/utils/toStream";
import type { Payload } from "@/types/history";
import type { WithMetadataStreamEvent } from "@/types/output";

type AnthropicModelConstructor = new () => AnthropicModelClass;

const MODEL_REGISTRY: Record<AnthropicModelId, AnthropicModelConstructor> = {
  [CLAUDE_SONNET_4_5_20250929_MODEL_ID]: ClaudeSonnet4_5V20250929,
};

const getAnthropicModel = (modelId: AnthropicModelId): AnthropicModelClass => {
  const ModelClass = MODEL_REGISTRY[modelId];

  if (!ModelClass) {
    throw new Error(`Unsupported model id: ${modelId}`);
  }

  return new ModelClass();
};

export interface AnthropicClientConfig {
  apiKey: string;
  baseURL?: string;
}

export class AnthropicMessagesClient extends BaseClient {
  private client: Anthropic;

  constructor(config: AnthropicClientConfig) {
    super();
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  // biome-ignore lint/suspicious/useAwait: Required by base class interface
  async *internalStream(
    modelId: string,
    payload: Payload,
    config: z.infer<z.ZodType>
  ): AsyncGenerator<WithMetadataStreamEvent, void> {
    const model = getAnthropicModel(modelId as AnthropicModelId);
    const input = toInput(payload, modelId as AnthropicModelId);

    const streamParams = {
      model: modelId,
      messages: input.messages,
      stream: true as const,
      ...model.toConfig(config),
    };

    // Only include system if it's defined
    const stream = this.client.messages.stream(
      input.system ? { ...streamParams, system: input.system } : streamParams
    );

    yield* convertAnthropicStreamToRouterEvents(
      stream,
      modelId as AnthropicModelId
    );
  }
}
