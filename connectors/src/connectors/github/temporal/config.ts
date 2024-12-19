// TODO(2024-12-19 aubin): remove these once we only have long-running workflows in the old queue and have moved them to the new one
export const OLD_WORKFLOW_VERSION = 2;
export const OLD_QUEUE_NAME = `github-queue-v${OLD_WORKFLOW_VERSION}`;

export const WORKFLOW_VERSION = 3;
export const QUEUE_NAME = `github-queue-v${WORKFLOW_VERSION}`;
