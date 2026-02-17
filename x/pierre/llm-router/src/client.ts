import type { BaseClient } from "@/baseClient";
import type { AnthropicClientConfig } from "@/providers/anthropic/client";
import { AnthropicMessagesClient } from "@/providers/anthropic/client";
import type { ANTHROPIC_PROVIDER_ID } from "@/providers/anthropic/types";
import type { OpenAIClientConfig } from "@/providers/openai/client";
import { OpenAIResponsesClient } from "@/providers/openai/client";
import type { OPENAI_PROVIDER_ID } from "@/providers/openai/types";
import type {
  WithMetadataFinishEvent,
  WithMetadataStreamEvent,
} from "@/types/output";
import type { StreamInput } from "./types/client";
import type { ProviderId } from "./types/provider";

type ClientConfig =
  | {
      providerId: typeof OPENAI_PROVIDER_ID;
      config: OpenAIClientConfig;
    }
  | {
      providerId: typeof ANTHROPIC_PROVIDER_ID;
      config: AnthropicClientConfig;
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
      case "anthropic":
        this.implementation = new AnthropicMessagesClient(options.config);
        break;
      default: {
        const _exhaustiveCheck: never = options;
        throw new Error(`Unsupported provider: ${_exhaustiveCheck}`);
      }
    }
  }

  async *stream({
    modelId,
    payload,
    config,
  }: StreamInput): AsyncGenerator<
    WithMetadataStreamEvent,
    WithMetadataFinishEvent
  > {
    // TypeScript can't narrow the union types automatically, so we need to cast
    // The runtime safety is guaranteed by the constructor setting the correct providerId
    return yield* this.implementation.stream({
      providerId: this.providerId,
      modelId,
      payload,
      config,
    } as Parameters<BaseClient["stream"]>[0]);
  }
}
