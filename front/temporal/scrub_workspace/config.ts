const QUEUE_VERSION = 2;
export const QUEUE_NAME = `scrub-workspace-queue-v${QUEUE_VERSION}`;

export const DOWNGRADE_FREE_ENDED_WORKSPACES_WORKFLOW_ID =
  "downgrade-and-scrub-free-ended-workspaces";

// One scrub child per workspace, and Temporal caps pending children at 1000 per
// run — going over wedges the cron. Backlog drains over successive runs.
export const MAX_WORKSPACES_TO_DOWNGRADE_PER_RUN = 500;

export const LAST_EMAIL_BEFORE_SCRUB_IN_DAYS = 3;
export const WORKSPACE_DEFAULT_RETENTION_DAYS = 30;
export const WORKSPACE_RETENTION_MIN_DAYS = 7;
export const WORKSPACE_RETENTION_MAX_DAYS = 1000;
