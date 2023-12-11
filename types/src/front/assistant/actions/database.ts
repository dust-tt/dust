import { ModelId } from "shared/model_id";

import { AgentActionConfigurationType } from "../../../front/assistant/agent";
import { AgentActionType } from "../../../front/assistant/conversation";

export type DatabaseConfigurationType = {
  id: ModelId;
  sId: string;
  type: "database_configuration";
  dataSourceId: string;
  databaseId: string;
};

export function isDatabaseConfiguration(
  arg: AgentActionConfigurationType | null
): arg is DatabaseConfigurationType {
  return arg !== null && arg.type && arg.type === "database_configuration";
}

export function isDatabaseActionType(
  arg: AgentActionType
): arg is DatabaseActionType {
  return arg.type === "database_query_action";
}

// TODO DAPH DATABASE ACTION
export type DatabaseActionType = {
  id: ModelId;
  type: "database_query_action";
};
