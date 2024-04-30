import type { ModelId } from "@dust-tt/types";

import type { DustAppParameters } from "@app/lib/api/assistant/actions/dust_app_run/types";
import type { AgentActionType } from "@app/lib/api/assistant/actions/types";

export type TablesQueryConfigurationType = {
  id: ModelId;
  sId: string;
  type: "tables_query_configuration";
  tables: Array<{
    workspaceId: string;
    dataSourceId: string;
    tableId: string;
  }>;

  name: string | null;
  description: string | null;
  forceUseAtIteration: number | null;
};

export function isTablesQueryConfiguration(
  arg: unknown
): arg is TablesQueryConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "tables_query_configuration"
  );
}

export type TablesQueryActionType = {
  id: ModelId;
  type: "tables_query_action";

  params: DustAppParameters;
  output: Record<string, string | number | boolean> | null;
};

export function isTablesQueryActionType(
  arg: AgentActionType
): arg is TablesQueryActionType {
  return arg.type === "tables_query_action";
}

export type TablesQueryErrorEvent = {
  type: "tables_query_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code:
      | "tables_query_error"
      | "tables_query_parameters_generation_error"
      | "too_many_result_rows";
    message: string;
  };
};

export type TablesQuerySuccessEvent = {
  type: "tables_query_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

export type TablesQueryParamsEvent = {
  type: "tables_query_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

export type TablesQueryOutputEvent = {
  type: "tables_query_output";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};
