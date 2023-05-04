import { DataSourceInfo } from "@connectors/types/data_source_config";

export function getWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-notion-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}
