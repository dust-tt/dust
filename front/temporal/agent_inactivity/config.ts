const QUEUE_VERSION = 1;

export const QUEUE_NAME = `agent-inactivity-queue-v${QUEUE_VERSION}`;

export const ARCHIVE_INACTIVE_AGENTS_SCHEDULE_ID =
  "archive-inactive-agents-schedule";

const WORKSPACE_WORKFLOW_ID_PREFIX = "archive-inactive-agents-workspace-";

/**
 * Scoped by workspace, not by run: a tick that finds the previous sweep of the same workspace still
 * running skips it instead of starting a second one over the same agents.
 */
export function makeArchiveWorkspaceWorkflowId(workspaceId: string): string {
  return `${WORKSPACE_WORKFLOW_ID_PREFIX}${workspaceId}`;
}
