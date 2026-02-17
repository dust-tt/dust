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
import * as fs from "node:fs";
import * as path from "node:path";

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

  async *internalStream(
    modelId: typeof ClaudeSonnet4_5V20250929.modelId,
    payload: Payload,
    config: z.infer<typeof ClaudeSonnet4_5V20250929.configSchema>
  ): AsyncGenerator<WithMetadataStreamEvent, void> {
    const model = getAnthropicModel(modelId);
    const inputMessages = toInput(payload, modelId);

    const timestamp = Date.now().toString();
    const providerPath = path.join(__dirname, `events_input_${timestamp}.json`);

    await fs.promises.writeFile(
      providerPath,
      JSON.stringify(
        {
          ...inputMessages,
          model: modelId,
          stream: true,
          ...model.toConfig(config),
        },
        null,
        2
      ),
      "utf8"
    );

    // Only include system if it's defined
    const stream = this.client.beta.messages.stream({
      ...inputMessages,
      model: modelId,
      stream: true,
      ...model.toConfig(config),
    });

    yield* convertAnthropicStreamToRouterEvents(stream, modelId);
  }
}
