import type { z } from "zod";

import type { GptFiveDotTwoV20251211 } from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { OPENAI_PROVIDER_ID } from "@/providers/openai/types";
import type { Payload } from "@/types/history";
import type {
  WithMetadataErrorEvent,
  WithMetadataFinishEvent,
  WithMetadataStreamEvent,
} from "@/types/output";

export abstract class BaseClient {
  abstract internalStream(
    modelId: typeof GptFiveDotTwoV20251211.modelId,
    payload: Payload,
    config: z.input<typeof GptFiveDotTwoV20251211.configSchema>
  ): AsyncGenerator<WithMetadataStreamEvent>;

  async *stream(
    providerId: typeof OPENAI_PROVIDER_ID,
    modelId: typeof GptFiveDotTwoV20251211.modelId,
    payload: Payload,
    config: z.input<typeof GptFiveDotTwoV20251211.configSchema>
  ): AsyncGenerator<WithMetadataStreamEvent, WithMetadataFinishEvent> {
    try {
      let lastEvent: WithMetadataStreamEvent | null = null;

      const stream = this.internalStream(modelId, payload, config);

      for await (const event of stream) {
        lastEvent = event;

        yield lastEvent;
      }

      if (lastEvent === null) {
        lastEvent = {
          type: "error",
          content: {
            message: "No events received",
            code: "empty_stream",
          },
          metadata: { modelId, providerId },
        };

        return lastEvent;
      }

      if (lastEvent.type === "completion" || lastEvent.type === "error") {
        return lastEvent;
      }

      lastEvent = {
        type: "error",
        content: {
          message: "Incomplete stream",
          code: "incomplete",
        },
        metadata: { modelId, providerId },
      };

      yield lastEvent;

      return lastEvent;
    } catch (error) {
      const errorEvent: WithMetadataErrorEvent = {
        type: "error",
        content: {
          message: "Unhandled error",
          code: "unhandled",
          originalError: error,
        },
        metadata: { modelId, providerId },
      };

      yield errorEvent;

      return errorEvent;
    }
  }
}
