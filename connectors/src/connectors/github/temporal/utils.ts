import { DataSourceInfo } from "@connectors/types/data_source_config";

export function getFullSyncWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-github-full-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getReposSyncWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-github-repos-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getIssueSyncWorkflowId(
  dataSourceInfo: DataSourceInfo,
  issueNumber: number
) {
  return `workflow-github-issue-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${issueNumber}`;
}
