import type { Where, WorkspaceConfig } from "@app/lib/llms/types/filter";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export type DustBatchEndpointConfiguration<C extends InputConfig> = {
  // `ModelConfigurationType` is the legacy model config, nested under a single
  // `modelConfig` static (see `DustStreamEndpointConfiguration`) so consumers
  // can retrieve the full config off the endpoint. Transitional.
  modelConfig: ModelConfigurationType;
} & BaseEndpointConfiguration<C> & {
    // Filter
    endpointFilter: Where<WorkspaceConfig>;
  };
