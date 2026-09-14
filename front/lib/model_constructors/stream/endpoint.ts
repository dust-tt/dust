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
  /**
   * @cc [label:error-handling] single-terminal-model-response-event
   * The yielded `ModelResponseEvent` sequence must end with exactly one terminal event — either
   * `success` or `error`, never both — and every `token_usage` event must be emitted before it.
   *
   * Consumers (`LLM.streamWithTracing`, `completeStream`) stop at the first terminal event:
   * anything yielded after it is dropped, and a `success` following an `error` double-counts the
   * call as both a failure and a success in telemetry. When a provider stop/finish reason maps to
   * an error, hold the error back until the usage has been yielded, then yield the error and end
   * the stream.
   */
  abstract rawStreamOutputToEvents(
    raw: AsyncGenerator<O>
  ): AsyncGenerator<ModelResponseEvent>;
}
