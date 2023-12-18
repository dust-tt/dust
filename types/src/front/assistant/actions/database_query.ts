import { ModelId } from "shared/model_id";

import { AgentActionConfigurationType } from "../../../front/assistant/agent";
import { AgentActionType } from "../../../front/assistant/conversation";

export type DatabaseQueryConfigurationType = {
  id: ModelId;
  sId: string;
  type: "database_query_configuration";
  dataSourceWorkspaceId: string;
  dataSourceId: string;
  databaseId: string;
};

export function isDatabaseQueryConfiguration(
  arg: AgentActionConfigurationType | null
): arg is DatabaseQueryConfigurationType {
  return (
    arg !== null && arg.type && arg.type === "database_query_configuration"
  );
}

export function isDatabaseQueryActionType(
  arg: AgentActionType
): arg is DatabaseQueryActionType {
  return arg.type === "database_query_action";
}

export type DatabaseQueryActionType = {
  id: ModelId;
  type: "database_query_action";
  dataSourceWorkspaceId: string;
  dataSourceId: string;
  databaseId: string;
  params: {
    [key: string]: string | number | boolean;
  };
  output: {
    [key: string]: string | number | boolean;
  } | null;
};
