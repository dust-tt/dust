import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";

export type StreamModelConfiguration = BaseEndpointConfiguration;

export type StreamEndpointConstructor = (new (
  credentials: Credentials
) => StreamEndpoint<any, any>) &
  StreamModelConfiguration;
