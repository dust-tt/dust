import { ModelId } from "shared/model_id";

import { AgentActionConfigurationType } from "../../../front/assistant/agent";
import { AgentActionType } from "../../../front/assistant/conversation";

export type TablesQueryConfigurationType = {
  id: ModelId;
  sId: string;
  type: "tables_query_configuration";
  tables: {
    dataSourceWorkspaceId: string;
    dataSourceId: string;
    tableId: string;
  }[];
};

export type TablesQueryActionType = {
  id: ModelId;
  type: "tables_query_action";
  // tables: {
  //   dataSourceWorkspaceId: string;
  //   dataSourceId: string;
  //   tableId: string;
  // }[];

  params: Record<string, string | number | boolean>;
  output: Record<string, string | number | boolean> | null;
};

export function isTablesQueryConfiguration(
  arg: AgentActionConfigurationType | null
): arg is TablesQueryConfigurationType {
  return arg?.type === "database_query_configuration";
}

export function isTablesQueryActionType(
  arg: AgentActionType
): arg is TablesQueryActionType {
  return arg.type === "database_query_action";
}
