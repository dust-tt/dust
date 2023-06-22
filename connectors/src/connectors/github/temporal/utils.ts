import { DataSourceInfo } from "@connectors/types/data_source_config";

export function getFullSyncWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-github-full-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getReposSyncWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-github-repos-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getIssueSyncWorkflowId(
  dataSourceInfo: DataSourceInfo,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-issue-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${repoId}-${issueNumber}`;
}

export function getDiscussionSyncWorkflowId(
  connectorId: string,
  dataSourceInfo: DataSourceInfo,
  repoId: number,
  discussionNumber: number
) {
  return `workflow-github-discussion-sync-${connectorId}-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${repoId}-${discussionNumber}`;
}

export function getIssueGarbageCollectWorkflowId(
  dataSourceInfo: DataSourceInfo,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-issue-garbage-collect-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${repoId}-${issueNumber}`;
}

export function getDiscussionGarbageCollectWorkflowId(
  connectorId: string,
  dataSourceInfo: DataSourceInfo,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-discussion-garbage-collect-${connectorId}-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${repoId}-${issueNumber}`;
}

export function getRepoGarbageCollectWorkflowId(
  dataSourceInfo: DataSourceInfo,
  repoId: number
) {
  return `workflow-github-repo-garbage-collect-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${repoId}`;
}
