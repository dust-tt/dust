import type { EndpointFilter, Where } from "@app/lib/llms/types/filter";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";

export type DustBatchEndpointConfiguration<C extends InputConfig> =
  BaseEndpointConfiguration<C> & {
    // Filter
    endpointFilter: Where<EndpointFilter>;
  };
