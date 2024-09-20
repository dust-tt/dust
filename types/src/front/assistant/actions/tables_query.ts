import { DustAppParameters } from "../../../front/assistant/actions/dust_app_run";
import { BaseAction } from "../../../front/lib/api/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";

export type TablesQueryConfigurationType = {
  description: string | null;
  id: ModelId;
  name: string;
  sId: string;
  tables: TableDataSourceConfiguration[];
  type: "tables_query_configuration";
};

export type TableDataSourceConfiguration = {
  dataSourceViewId: string;
  tableId: string;
  workspaceId: string;
};

export interface TablesQueryActionType extends BaseAction {
  id: ModelId;
  params: DustAppParameters;
  output: Record<string, string | number | boolean> | null;
  functionCallId: string | null;
  functionCallName: string | null;
  agentMessageId: ModelId;
  step: number;
  type: "tables_query_action";
}
