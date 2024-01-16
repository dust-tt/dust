import { ModelId } from "../../../shared/model_id";

export type TablesQueryConfigurationType = {
  id: ModelId;
  sId: string;
  type: "tables_query_configuration";
  tables: Array<{
    workspaceId: string;
    dataSourceId: string;
    tableId: string;
  }>;
};

export type TablesQueryActionType = {
  id: ModelId;
  type: "tables_query_action";

  params: Record<string, string | number | boolean>;
  output: Record<string, string | number | boolean> | null;
};
