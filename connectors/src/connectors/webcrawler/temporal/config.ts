const WORKFLOW_VERSION = 1;

export enum WebCrawlerQueueNames {
  UPDATE_WEBSITE = `webcrawler-update-website-queue-v${WORKFLOW_VERSION}`,
  NEW_WEBSITE = `webcrawler-new-website-queue-v${WORKFLOW_VERSION}`,
}
