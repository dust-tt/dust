import { DustAppParameters } from "../../../front/assistant/actions/dust_app_run";
import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

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

export interface TablesQueryActionType extends BaseAction {
  id: ModelId;
  params: DustAppParameters;
  output: Record<string, string | number | boolean> | null;
  agentMessageId: ModelId;
  step: number;
}
