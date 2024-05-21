export const WORKFLOW_VERSION = 1;

export enum QueueNames {
  UPDATE_WEBSITE_QUEUE_NAME = `webcrawler-update-queue-v${WORKFLOW_VERSION}`,
  NEW_WEBSITE_QUEUE_NAME = `webcrawler-new-queue-v${WORKFLOW_VERSION}`,
}
