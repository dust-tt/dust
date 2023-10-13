import { ModelId } from "@connectors/lib/models";
import { DataSourceInfo } from "@connectors/types/data_source_config";

export function getWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-notion-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getWorkflowIdV2(connectorId: ModelId) {
  return `notion-${connectorId}`;
}
