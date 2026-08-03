import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";

export type StreamModelConfiguration<C extends InputConfig = InputConfig> =
  BaseEndpointConfiguration<C>;

export type StreamEndpointConstructor<
  I = unknown,
  O = unknown,
  C extends InputConfig = InputConfig,
> = (new (
  credentials: Credentials
) => StreamEndpoint<I, O, C>) &
  StreamModelConfiguration<C>;
