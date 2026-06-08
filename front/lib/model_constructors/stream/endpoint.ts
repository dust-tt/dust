import { Client } from "@app/lib/model_constructors/client";
import type { StreamModelConfiguration } from "@app/lib/model_constructors/stream/configuration";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type {
  EventMetadata,
  LargeLanguageModelResponseEvent,
} from "@app/lib/model_constructors/types/output/events";
import {
  ORDERED_REASONING_EFFORTS,
  type ReasoningEffort,
} from "@app/lib/model_constructors/types/reasoning_efforts";

// Streaming inference. Generic over the raw request payload `I` (consumed by
// `streamRaw`) and raw stream event `O` (yielded by `streamRaw` and consumed by
// `rawStreamOutputToEvents`). Concrete providers pin these to their SDK types
// (e.g. Anthropic's `MessageCreateParamsNonStreaming` / `RawMessageStreamEvent`).
export abstract class StreamEndpoint<I = unknown, O = unknown> extends Client {
  abstract buildRequestPayload(payload: Payload, config: InputConfig): I;
  abstract streamRaw(input: I): AsyncGenerator<O>;
  abstract rawStreamOutputToEvents(
    raw: AsyncGenerator<O>
  ): AsyncGenerator<LargeLanguageModelResponseEvent>;

  // Computes the reasoning efforts a model accepts from its `configSchema`.
  // Typed via `this` rather than the class so it composes with whichever
  // surface configuration carries the schema.
  static buildSupportedReasoningEfforts(this: {
    configSchema: StreamModelConfiguration["configSchema"];
  }): ReasoningEffort[] {
    return ORDERED_REASONING_EFFORTS.filter(
      (effort) => this.configSchema.safeParse({ reasoning: { effort } }).success
    );
  }

  // The model identity stamped onto every output event, derived from the
  // concrete subclass's static configuration fields.
  metadata(): EventMetadata {
    return {
      providerId: this.constructor.providerId,
      api: this.constructor.api,
      region: this.constructor.region,
      modelId: this.constructor.modelId,
    };
  }
}
