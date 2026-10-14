import type { Where, WorkspaceConfig } from "@app/lib/llms/types/filter";
import type { SystemOneModelConfiguration } from "@app/lib/model_constructors/system_one/configuration";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export type DustSystemOneEndpointConfiguration = {
  // Legacy model config, nested like on stream and batch endpoints. Usage is
  // recorded and priced under its `modelId`.
  modelConfig: ModelConfigurationType;
} & SystemOneModelConfiguration & {
    endpointFilter: Where<WorkspaceConfig>;
  };
