import { DataSourceInfo } from "@connectors/types/data_source_config";

export function getFullSyncWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-github-full-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}
