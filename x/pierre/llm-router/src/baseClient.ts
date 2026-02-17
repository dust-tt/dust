import type { z } from "zod";

import type { Payload } from "@/types/history";
import type {
  WithMetadataErrorEvent,
  WithMetadataFinishEvent,
  WithMetadataStreamEvent,
} from "@/types/output";
import type { ClaudeSonnet4_5V20250929 } from "./providers/anthropic/models/claude-sonnet-4-5-20250929";
import type { ANTHROPIC_PROVIDER_ID } from "./providers/anthropic/types";
import type { GptFiveDotTwoV20251211 } from "./providers/openai/models/gpt-5.2-2025-12-11";
import type { OPENAI_PROVIDER_ID } from "./providers/openai/types";

export abstract class BaseClient {
  abstract internalStream(
    modelId: string,
    payload: Payload,
    config: z.infer<z.ZodType>
  ): AsyncGenerator<WithMetadataStreamEvent>;

  async *stream(
    params:
      | {
          providerId: typeof OPENAI_PROVIDER_ID;
          modelId: typeof GptFiveDotTwoV20251211.modelId;
          payload: Payload;
          config: z.input<typeof GptFiveDotTwoV20251211.configSchema>;
        }
      | {
          providerId: typeof ANTHROPIC_PROVIDER_ID;
          modelId: typeof ClaudeSonnet4_5V20250929.modelId;
          payload: Payload;
          config: z.input<typeof ClaudeSonnet4_5V20250929.configSchema>;
        }
  ): AsyncGenerator<WithMetadataStreamEvent, WithMetadataFinishEvent> {
    const { providerId, modelId, payload, config } = params;

    try {
      let lastEvent: WithMetadataStreamEvent | null = null;

      const stream = this.internalStream(modelId, payload, config);

      for await (const event of stream) {
        lastEvent = event;

        yield lastEvent;
      }

      if (lastEvent === null) {
        const errorEvent: WithMetadataErrorEvent = {
          type: "error",
          content: {
            message: "No events received",
            code: "empty_stream",
          },
          // biome-ignore lint/suspicious/noExplicitAny: modelId and providerId are strings at runtime
          metadata: { modelId, providerId } as any,
        };

        return errorEvent;
      }

      if (lastEvent.type === "completion" || lastEvent.type === "error") {
        return lastEvent;
      }

      const incompleteEvent: WithMetadataErrorEvent = {
        type: "error",
        content: {
          message: "Incomplete stream",
          code: "incomplete",
        },
        // biome-ignore lint/suspicious/noExplicitAny: modelId and providerId are strings at runtime
        metadata: { modelId, providerId } as any,
      };

      yield incompleteEvent;

      return incompleteEvent;
    } catch (error) {
      const errorEvent: WithMetadataErrorEvent = {
        type: "error",
        content: {
          message: "Unhandled error",
          code: "unhandled",
          originalError: error,
        },
        // biome-ignore lint/suspicious/noExplicitAny: modelId and providerId are strings at runtime
        metadata: { modelId, providerId } as any,
      };

      yield errorEvent;

      return errorEvent;
    }
  }
}
