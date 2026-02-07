import assertNever from "assert-never";
import type { z } from "zod";

import type { BaseClient } from "@/baseClient";
import type { OpenAIClientConfig } from "@/providers/openai/client";
import { OpenAIResponsesClient } from "@/providers/openai/client";
import type { GptFiveDotTwoV20251211 } from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { OPENAI_PROVIDER_ID } from "@/providers/openai/types";
import type { Payload } from "@/types/history";
import type {
  WithMetadataFinishEvent,
  WithMetadataStreamEvent,
} from "@/types/output";
import type { ProviderId } from "./types/provider";

type ClientConfig = {
  providerId: typeof OPENAI_PROVIDER_ID;
  config: OpenAIClientConfig;
};

export class Client {
  private implementation: BaseClient;
  private providerId: ProviderId;

  constructor(options: ClientConfig) {
    this.providerId = options.providerId;

    switch (options.providerId) {
      case "openai":
        this.implementation = new OpenAIResponsesClient(options.config);
        break;
      default:
        assertNever(options.providerId);
    }
  }

  // async keyword required for AsyncGenerator type, yield* delegates to async generator
  // biome-ignore lint/suspicious/useAwait: suppressing because async is needed for type compatibility
  async *stream(
    modelId: typeof GptFiveDotTwoV20251211.modelId,
    payload: Payload,
    config: z.input<typeof GptFiveDotTwoV20251211.configSchema>
  ): AsyncGenerator<WithMetadataStreamEvent, WithMetadataFinishEvent> {
    return yield* this.implementation.stream(
      this.providerId,
      modelId,
      payload,
      config
    );
  }
}
