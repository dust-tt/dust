import { Client } from "@app/lib/model_constructors/client";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";

// Generic over the raw request payload `I` and raw stream event `O`.
export abstract class StreamEndpoint<
  I = unknown,
  O = unknown,
  C extends InputConfig = InputConfig,
> extends Client<C> {
  // Async-capable so providers that must resolve external resources (e.g.
  // fetching+inlining images for Gemini) can build the payload. Sync providers
  // simply return `I`.
  abstract buildRequestPayload(payload: Payload, config: C): Promise<I> | I;
  abstract streamRaw(input: I): AsyncGenerator<O>;
  abstract rawStreamOutputToEvents(
    raw: AsyncGenerator<O>
  ): AsyncGenerator<ModelResponseEvent>;
}
