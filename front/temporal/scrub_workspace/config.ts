const QUEUE_VERSION = 2;
export const QUEUE_NAME = `scrub-workspace-queue-v${QUEUE_VERSION}`;

export const DOWNGRADE_FREE_ENDED_WORKSPACES_WORKFLOW_ID =
  "downgrade-and-scrub-free-ended-workspaces";

export const DATA_RETENTION_PERIOD_IN_DAYS = 30; // To be deprecated soon by calling getWorkspaceDataRetention
export const LAST_EMAIL_BEFORE_SCRUB_IN_DAYS = 3;
