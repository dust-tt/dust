import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { SystemOneEndpoint } from "@app/lib/model_constructors/system_one/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";

export type SystemOneModelConfiguration<C extends InputConfig = InputConfig> =
  BaseEndpointConfiguration<C>;

export type SystemOneEndpointConstructor<C extends InputConfig = InputConfig> =
  (new (
    credentials: Credentials
  ) => SystemOneEndpoint<C>) &
    SystemOneModelConfiguration<C>;
