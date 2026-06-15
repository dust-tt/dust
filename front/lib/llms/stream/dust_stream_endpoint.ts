import type { DustModelConfiguration } from "@app/lib/llms/configuration";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";

// Generic over raw payload `I`, raw stream event `O`, input config `C`.
export abstract class DustStreamEndpoint<
  I = unknown,
  O = unknown,
  C extends InputConfig = InputConfig,
> extends StreamEndpoint<I, O> {
  declare ["constructor"]: DustModelConfiguration<C>;
}

// Like `StreamEndpointConstructor`, but with `DustModelConfiguration`.
export type DustStreamEndpointConstructor<
  I = unknown,
  O = unknown,
  C extends InputConfig = InputConfig,
> = (new (
  credentials: Credentials
) => StreamEndpoint<I, O>) &
  DustModelConfiguration<C>;

// Infers `C` from the class's `configSchema` so `defaultReasoningEffort` is
// checked against the endpoint's supported efforts. Returns the class unchanged.
export function defineDustStreamEndpoint<I, O, C extends InputConfig>(
  endpoint: DustStreamEndpointConstructor<I, O, C>
): DustStreamEndpointConstructor<I, O, C> {
  return endpoint;
}
