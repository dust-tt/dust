import type { ModelId } from "@dust-tt/types";
import {
  ActivityCancellationType,
  CancellationScope,
  proxyActivities,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/webcrawler/temporal/activities";

const { crawlWebsiteByConnectorId } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  // for each page crawl, there are heartbeats, but a page crawl can last at max
  // REQUEST_HANDLING_TIMEOUT seconds (cf in activities.ts)
  heartbeatTimeout: `420 seconds`,
});

const { testActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
  heartbeatTimeout: "2 seconds",
  cancellationType: ActivityCancellationType.TRY_CANCEL,
  retry: {
    maximumAttempts: 1,
  },
});

export async function crawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<void> {
  await crawlWebsiteByConnectorId(connectorId);
}

export function crawlWebsiteWorkflowId(connectorId: ModelId) {
  return `webcrawler-${connectorId}`;
}

export async function testWorkflow(): Promise<void> {
  //await testActivity(10, 3000);
  try {
    await CancellationScope.cancellable(async () => {
      await testActivity(10, 3000);
    });
  } catch (e) {
    console.log("test workflow error");
    throw e;
  }
}
