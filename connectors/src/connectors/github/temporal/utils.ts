import type { ModelId } from "@dust-tt/types";

import type { DataSourceInfo } from "@connectors/types/data_source_config";

export function getFullSyncWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-github-full-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getReposSyncWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-github-repos-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getCodeSyncWorkflowId(
  dataSourceInfo: DataSourceInfo,
  repoId: number
) {
  return `workflow-github-code-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${repoId}`;
}

export function getIssueSyncWorkflowId(
  dataSourceInfo: DataSourceInfo,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-issue-sync-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}-${repoId}-${issueNumber}`;
}

export function getDiscussionSyncWorkflowId(
  connectorId: ModelId,
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
  connectorId: ModelId,
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
