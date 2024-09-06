import type { ModelId } from "@dust-tt/types";

export function getFullSyncWorkflowId(connectorId: ModelId) {
  return `workflow-github-${connectorId}-full-sync`;
}

export function getReposSyncWorkflowId(connectorId: ModelId) {
  return `workflow-github-${connectorId}-repos-sync`;
}

export function getCodeSyncWorkflowId(connectorId: ModelId, repoId: number) {
  return `workflow-github-${connectorId}-code-sync-${repoId}`;
}

export function getCodeSyncDailyCronWorkflowId(
  connectorId: ModelId,
  repoId: number
) {
  return `workflow-github-${connectorId}-code-sync-daily-cron-${repoId}`;
}

export function getIssueSyncWorkflowId(
  connectorId: ModelId,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-${connectorId}-issue-sync-${repoId}-${issueNumber}`;
}

export function getDiscussionSyncWorkflowId(
  connectorId: ModelId,
  repoId: number,
  discussionNumber: number
) {
  return `workflow-github-${connectorId}-discussion-sync-${repoId}-${discussionNumber}`;
}

export function getIssueGarbageCollectWorkflowId(
  connectorId: ModelId,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-${connectorId}-issue-garbage-collect-${repoId}-${issueNumber}`;
}

export function getDiscussionGarbageCollectWorkflowId(
  connectorId: ModelId,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-${connectorId}-discussion-garbage-collect-${repoId}-${issueNumber}`;
}

export function getRepoGarbageCollectWorkflowId(
  connectorId: ModelId,
  repoId: number
) {
  return `workflow-github-${connectorId}-repo-garbage-collect-${repoId}`;
}
