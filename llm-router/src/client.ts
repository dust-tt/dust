import type { GPT_5_2_2025_12_11 } from "@/providers/openai/models/gpt-5.2-2025-12-11";
import { OPENAI_PROVIDER_ID } from "@/providers/openai/types";
import type {
  WithMetadataErrorEvent,
  WithMetadataFinishEvent,
  WithMetadataStreamEvent,
} from "@/types/output";
import type { Payload } from "@/types/history";
import { z } from "zod";

export abstract class Client {
  protected constructor() {}

  abstract internalStream(
    modelId: typeof GPT_5_2_2025_12_11.modelId,
    payload: Payload,
    config: z.input<typeof GPT_5_2_2025_12_11.configSchema>
  ): AsyncGenerator<WithMetadataStreamEvent>;

  async *stream(
    _providerId: typeof OPENAI_PROVIDER_ID,
    modelId: typeof GPT_5_2_2025_12_11.modelId,
    payload: Payload,
    config: z.input<typeof GPT_5_2_2025_12_11.configSchema>
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
          metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
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
        metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
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
        metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
      };

      yield errorEvent;

      return errorEvent;
    }
  }
}
