import type { ModelId } from "@dust-tt/types";

export function getFullSyncWorkflowId(connectorId: ModelId) {
  return `workflow-github-full-sync-${connectorId}`;
}

export function getReposSyncWorkflowId(connectorId: ModelId) {
  return `workflow-github-repos-sync-${connectorId}`;
}

export function getCodeSyncWorkflowId(connectorId: ModelId, repoId: number) {
  return `workflow-github-code-sync-${connectorId}-${repoId}`;
}

export function getCodeSyncDailyCronWorkflowId(
  connectorId: ModelId,
  repoId: number
) {
  return `workflow-github-code-sync-daily-cron-${connectorId}-${repoId}`;
}

export function getIssueSyncWorkflowId(
  connectorId: ModelId,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-issue-sync-${connectorId}-${repoId}-${issueNumber}`;
}

export function getDiscussionSyncWorkflowId(
  connectorId: ModelId,
  repoId: number,
  discussionNumber: number
) {
  return `workflow-github-discussion-sync-${connectorId}-${repoId}-${discussionNumber}`;
}

export function getIssueGarbageCollectWorkflowId(
  connectorId: ModelId,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-issue-garbage-collect-${connectorId}-${repoId}-${issueNumber}`;
}

export function getDiscussionGarbageCollectWorkflowId(
  connectorId: ModelId,
  repoId: number,
  issueNumber: number
) {
  return `workflow-github-discussion-garbage-collect-${connectorId}-${repoId}-${issueNumber}`;
}

export function getRepoGarbageCollectWorkflowId(
  connectorId: ModelId,
  repoId: number
) {
  return `workflow-github-repo-garbage-collect-${connectorId}-${repoId}`;
}
