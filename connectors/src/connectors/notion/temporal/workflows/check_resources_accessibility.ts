import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import type { ModelId } from "@connectors/types";

const { checkResourceAccessibility } = proxyActivities<typeof activities>({
  startToCloseTimeout: "3 minutes",
});

export type CheckResourcesAccessibilityInput = {
  connectorId: ModelId;
  resources: Array<{
    resourceId: string;
    resourceType: "page" | "database";
  }>;
  batchSize?: number;
  concurrency?: number;
};

export async function checkResourcesAccessibilityWorkflow({
  connectorId,
  resources,
  batchSize = 100,
  concurrency = 4,
}: CheckResourcesAccessibilityInput): Promise<void> {
  const currentBatch = resources.slice(0, batchSize);
  const remainingResources = resources.slice(batchSize);

  const queue = new PQueue({ concurrency });

  // Add all checks to the queue
  const promises = currentBatch.map((resource) =>
    queue.add(async () => {
      await checkResourceAccessibility({
        connectorId,
        resourceId: resource.resourceId,
        resourceType: resource.resourceType,
      });

      // Add a small delay after each check to avoid hitting rate limits
      await sleep(100); // 100ms delay
    })
  );

  await Promise.all(promises);

  if (remainingResources.length > 0) {
    await continueAsNew<typeof checkResourcesAccessibilityWorkflow>({
      connectorId,
      resources: remainingResources,
      batchSize,
      concurrency,
    });
  }
}
