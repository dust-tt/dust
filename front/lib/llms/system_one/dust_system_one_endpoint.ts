import type { DustSystemOneEndpointConfiguration } from "@app/lib/llms/system_one/types/configuration";
import type { SystemOneEndpoint } from "@app/lib/model_constructors/system_one/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";

// Like `SystemOneEndpointConstructor`, but with `DustSystemOneEndpointConfiguration`.
export type DustSystemOneEndpointConstructor = (new (
  credentials: Credentials
) => SystemOneEndpoint) &
  DustSystemOneEndpointConfiguration;
