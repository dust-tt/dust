import type { DustBatchEndpointConfiguration } from "@app/lib/llms/batch/types/configuration";
import { BatchEndpoint } from "@app/lib/model_constructors/batch/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";

// Generic over raw payload `I`, per-request result `R`, input config `C`.
export abstract class DustBatchEndpoint<
  I = unknown,
  R = unknown,
  C extends InputConfig = InputConfig,
> extends BatchEndpoint<I, R> {
  declare ["constructor"]: DustBatchEndpointConfiguration<C>;
}

// Like `BatchEndpointConstructor`, but with `DustBatchEndpointConfiguration`.
export type DustBatchEndpointConstructor<
  I = unknown,
  R = unknown,
  C extends InputConfig = InputConfig,
> = (new (
  credentials: Credentials
) => BatchEndpoint<I, R>) &
  DustBatchEndpointConfiguration<C>;

// Infers `C` from the class's `configSchema` so `defaultReasoningEffort` is
// checked against the endpoint's supported efforts. Returns the class unchanged.
export function defineDustBatchEndpoint<I, R, C extends InputConfig>(
  endpoint: DustBatchEndpointConstructor<I, R, C>
): DustBatchEndpointConstructor<I, R, C> {
  return endpoint;
}
