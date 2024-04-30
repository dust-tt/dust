import type {
  DataSourceConfiguration,
  ModelId,
  ProcessSchemaPropertyType,
  RetrievalTimeframe,
  TimeFrame,
} from "@dust-tt/types";

import type { AgentActionType } from "@app/lib/api/assistant/actions/types";

export type ProcessConfigurationType = {
  id: ModelId;
  sId: string;

  type: "process_configuration";

  dataSources: DataSourceConfiguration[];
  relativeTimeFrame: RetrievalTimeframe;
  schema: ProcessSchemaPropertyType[];

  name: string | null;
  description: string | null;
  forceUseAtIteration: number | null;
};

export function isProcessConfiguration(
  arg: unknown
): arg is ProcessConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "process_configuration"
  );
}

export type ProcessActionType = {
  id: ModelId;

  type: "process_action";

  params: {
    relativeTimeFrame: TimeFrame | null;
  };
  schema: ProcessSchemaPropertyType[];
  outputs: unknown[] | null;
};

export function isProcessActionType(
  arg: AgentActionType
): arg is ProcessActionType {
  return arg.type === "process_action";
}

// Event sent before the execution with the finalized params to be used.
export type ProcessParamsEvent = {
  type: "process_params";
  created: number;
  configurationId: string;
  messageId: string;
  dataSources: DataSourceConfiguration[];
  action: ProcessActionType;
};

export type ProcessErrorEvent = {
  type: "process_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type ProcessSuccessEvent = {
  type: "process_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: ProcessActionType;
};
