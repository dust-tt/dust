import { Client } from "@app/lib/model_constructors/client";
import type { StreamModelConfiguration } from "@app/lib/model_constructors/stream/configuration";
import type { AgentMetadata } from "@app/lib/model_constructors/types/agent_metadata";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type {
  ModelResponseEvent,
} from "@app/lib/model_constructors/types/output/events";
import {
  ORDERED_REASONING_EFFORTS,
  type ReasoningEffort,
} from "@app/lib/model_constructors/types/reasoning_efforts";

// Generic over the raw request payload `I` and raw stream event `O`. Concrete
// providers pin these to their SDK types.
export abstract class StreamEndpoint<I = unknown, O = unknown> extends Client {
  abstract buildRequestPayload(payload: Payload, config: InputConfig): I;
  abstract streamRaw(input: I): AsyncGenerator<O>;
  abstract rawStreamOutputToEvents(
    raw: AsyncGenerator<O>
  ): AsyncGenerator<ModelResponseEvent>;

  // Typed via `this` rather than the class so it composes with whichever
  // surface configuration carries the schema.
  static buildSupportedReasoningEfforts(this: {
    configSchema: StreamModelConfiguration["configSchema"];
  }): ReasoningEffort[] {
    return ORDERED_REASONING_EFFORTS.filter(
      (effort) => this.configSchema.safeParse({ reasoning: { effort } }).success
    );
  }

  metadata(): AgentMetadata {
    return {
      providerId: this.constructor.providerId,
      api: this.constructor.api,
      region: this.constructor.region,
      modelId: this.constructor.modelId,
    };
  }
}
